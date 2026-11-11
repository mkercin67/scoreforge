import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Murat/.gemini/antigravity/brain/0e08571a-6366-416f-a983-aad9fe52732a';
const DOCS_DIR = 'docs/screenshots/m3c';

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

function saveScreenshot(name, base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(path.join(DOCS_DIR, name), buf);
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), buf);
  console.log(`[SAVED] ${name} (${buf.length} bytes)`);
}

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9573',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m3c_e2e_v7',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9573/json/list', (res) => {
  let raw = '';
  res.on('data', (d) => (raw += d));
  res.on('end', async () => {
    const list = JSON.parse(raw);
    const ws = new globalThis.WebSocket(list[0].webSocketDebuggerUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });

    let msgId = 1;
    const callbacks = new Map();
    ws.onmessage = (evt) => {
      const resp = JSON.parse(evt.data);
      if (resp.id && callbacks.has(resp.id)) {
        const cb = callbacks.get(resp.id);
        callbacks.delete(resp.id);
        cb(resp);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const isStatement = /^\s*(const|let|var|function|if|for|while|switch)\b|[;]\s*$/.test(expression);
      const wrapped = isStatement
        ? `(() => {\n${expression}\n})()`
        : `(() => {\nreturn (${expression.trim()});\n})()`;
      const res = await send('Runtime.evaluate', {
        expression: wrapped,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.result?.exceptionDetails) {
        console.error('Eval exception:', res.result.exceptionDetails.text, res.result.exceptionDetails.exception?.description);
      }
      return res.result?.result?.value;
    }

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    async function capture(name) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      saveScreenshot(name, shot.result.data);
    }

    async function submitModal() {
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return;
        const btn = Array.from(modal.querySelectorAll('button')).find(b =>
          b.textContent.includes('Oluştur') || b.textContent.includes('Create')
        );
        if (btn) btn.click();
      `);
      await delay(400);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) return;
        const confirmBtn = Array.from(modal.querySelectorAll('button')).find(b =>
          b.textContent.includes('Onayla') || b.textContent.includes('Confirm') || b.textContent.includes('Oluştur')
        );
        if (confirmBtn) confirmBtn.click();
      `);
      for (let i = 0; i < 20; i++) {
        const dialogExists = await evaluate(`document.querySelector('[role="dialog"]') !== null`);
        if (!dialogExists) break;
        await delay(200);
      }
      await delay(500);
    }

    async function isInputModeOn() {
      return await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Nota girişi') || el.textContent.includes('Note input'));
        return btn ? getComputedStyle(btn).backgroundColor.includes('37, 99, 235') : false;
      `);
    }

    async function toggleInputMode() {
      const btn = await evaluate(`
        const b = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Nota girişi') || el.textContent.includes('Note input'));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      `);
      if (btn) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
        await delay(400);
      }
    }

    async function ensureInputMode(targetState = true) {
      for (let i = 0; i < 3; i++) {
        const active = await isInputModeOn();
        if (active === targetState) break;
        await toggleInputMode();
      }
    }

    try {
      await send('Page.enable');
      await send('DOM.enable');

      // ----------------------------------------------------------------------
      // STEP 1: Navigate to Production Preview (port 4173)
      // ----------------------------------------------------------------------
      console.log('>>> [START] M3c Production Verification Scenario at http://localhost:4173/');
      await send('Page.navigate', { url: 'http://localhost:4173/' });
      await delay(2500);

      // Performance measurement hooks
      await evaluate(`
        window.__m3cPerf = {
          pointermoveTimes: [],
          clickTimes: [],
          dragTimes: []
        };
        window.measureNextPaint = function(category) {
          const t0 = performance.now();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const t1 = performance.now();
              window.__m3cPerf[category].push(t1 - t0);
            });
          });
        };
      `);

      // ----------------------------------------------------------------------
      // STEP 2: New Score (+ Yeni -> Treble, C Major, 4/4, 8 measures)
      // ----------------------------------------------------------------------
      console.log('1. Action: New Score (+ Yeni -> Oluştur)');
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yeni'));
        if (btn) btn.click();
      `);
      await delay(500);
      await submitModal();

      // ----------------------------------------------------------------------
      // STEP 3: Note Input Mode ON
      // ----------------------------------------------------------------------
      console.log('2. Action: Note input mode ON');
      await ensureInputMode(true);

      const isInputMode = await evaluate(`
        document.body.innerText.includes('Nota girişi ·')
      `);
      console.log(`   Assert inputMode == true: ${isInputMode}`);

      // ----------------------------------------------------------------------
      // STEP 4: Hover over Treble Staff -> E5 ghost note
      // ----------------------------------------------------------------------
      console.log('3. Action: Hover over E5 -> ghost note visible');
      const staffPos = await evaluate(`
        const svg = document.querySelector('svg');
        const rect = svg ? svg.getBoundingClientRect() : { left: 100, top: 100 };
        return {
          x: Math.round(rect.left + 160),
          y: Math.round(rect.top + 75) // Line 0/1 area
        };
      `);

      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: staffPos.x, y: staffPos.y });
      await evaluate(`window.measureNextPaint('pointermoveTimes')`);
      await delay(400);

      const ghostNotePresent = await evaluate(`
        document.querySelector('.score-ghost-note') !== null
      `);
      console.log(`   Ghost note present: ${ghostNotePresent}`);

      // Screenshot 1: Hover ghost note on treble staff
      await capture('01_hover_ghost_treble.png');

      // ----------------------------------------------------------------------
      // STEP 5: Click to enter E5 (quarter note)
      // ----------------------------------------------------------------------
      console.log('4. Action: Click on E5 -> enter quarter note E5');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: staffPos.x, y: staffPos.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: staffPos.x, y: staffPos.y, button: 'left', clickCount: 1 });
      await evaluate(`window.measureNextPaint('clickTimes')`);
      await delay(500);

      // Screenshot 2: Note entered by click
      await capture('02_note_entered_click.png');

      // ----------------------------------------------------------------------
      // STEP 6: New Score in Bass Clef -> click D3
      // ----------------------------------------------------------------------
      console.log('5. Action: New Bass Clef Score -> Click note D3');
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yeni'));
        if (btn) btn.click();
      `);
      await delay(500);

      // Select Bass clef label in modal
      await evaluate(`
        const labels = Array.from(document.querySelectorAll('label'));
        const bassLabel = labels.find(l => l.textContent.includes('Fa') || l.textContent.includes('Bass'));
        if (bassLabel) bassLabel.click();
      `);
      await delay(300);
      await submitModal();

      // Re-enable input mode
      await ensureInputMode(true);

      // In bass clef: Line 3 (D3) in Measure 1
      const bassM1 = await evaluate(`
        const svg = document.querySelector('svg');
        const rect = svg ? svg.getBoundingClientRect() : { left: 100, top: 100 };
        return {
          x: Math.round(rect.left + 120),
          y: Math.round(rect.top + 90) // Line 3 (D3) in bass clef
        };
      `);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bassM1.x, y: bassM1.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bassM1.x, y: bassM1.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bassM1.x, y: bassM1.y, button: 'left', clickCount: 1 });
      await delay(500);

      // Screenshot 3: Bass clef click
      await capture('03_same_in_bass_clef.png');

      // ----------------------------------------------------------------------
      // STEP 7: Select whole note duration (𝅝) -> Click in Measure 1 -> Rejected
      // ----------------------------------------------------------------------
      console.log('6. Action: Whole note when space insufficient -> rejected with warning');
      await evaluate(`
        const btns = Array.from(document.querySelectorAll('button'));
        const wholeBtn = btns.find(b => b.textContent.includes('𝅝') || b.title.includes('Birlik') || b.title.includes('Whole'));
        if (wholeBtn) wholeBtn.click();
      `);
      await delay(300);

      // Click in Measure 1 where 1 quarter beat is used and only 3 remain (whole note needs 4 beats)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bassM1.x + 25, y: bassM1.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bassM1.x + 25, y: bassM1.y, button: 'left', clickCount: 1 });
      await delay(500);

      const rejectedStatus = await evaluate(`
        const text = document.body.textContent || '';
        return text.includes('sığmıyor') || text.includes('yetersiz') || text.includes('does not fit') || text.includes('kalan süre');
      `);
      console.log(`   Rejected warning displayed: ${rejectedStatus}`);

      // Screenshot 4: Rejected click with status message
      await capture('04_rejected_click_status.png');

      // ----------------------------------------------------------------------
      // STEP 8: Drag note by (+1, -1) staff spaces
      // ----------------------------------------------------------------------
      console.log('7. Action: Drag note by (+1, -1) staff spaces');
      // Exit input mode first
      await ensureInputMode(false);

      const targetGroup = await evaluate(`
        const noteGroup = Array.from(document.querySelectorAll('.score-event-group')).find(g => {
          return g.querySelector('use[href*="notehead"]') !== null || g.querySelector('line[data-id*="stem"]') !== null;
        });
        if (!noteGroup) return null;
        const notehead = noteGroup.querySelector('use[href*="notehead"]') || noteGroup;
        const rect = notehead.getBoundingClientRect();
        return {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          eventId: noteGroup.getAttribute('data-event-id')
        };
      `);
      console.log('   Drag target:', JSON.stringify(targetGroup));

      if (targetGroup) {
        // First click to select the note
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: targetGroup.x, y: targetGroup.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: targetGroup.x, y: targetGroup.y, button: 'left', clickCount: 1 });
        await delay(300);

        // Staff space = 10px. Drag dx = +1 space (+10px), dy = -1 space (-10px)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: targetGroup.x, y: targetGroup.y, button: 'left', clickCount: 1 });
        await delay(100);

        // Move with buttons: 1 (left button held in CDP)
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: targetGroup.x + 6, y: targetGroup.y - 6, buttons: 1 });
        await evaluate(`window.measureNextPaint('dragTimes')`);
        await delay(100);

        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: targetGroup.x + 10, y: targetGroup.y - 10, buttons: 1 });
        await evaluate(`window.measureNextPaint('dragTimes')`);
        await delay(100);

        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: targetGroup.x + 10, y: targetGroup.y - 10, button: 'left', clickCount: 1 });
        await delay(500);

        const overrideBadge = await evaluate(`
          const text = document.body.textContent || '';
          return text.includes('Elle konumlandırıldı') || text.includes('Manually positioned');
        `);
        console.log(`   Override badge present: ${overrideBadge}`);

        // Screenshot 5: Note dragged
        await capture('05_note_dragged.png');
      }

      // ----------------------------------------------------------------------
      // STEP 9: Ctrl+Z (Undo) restores original layout
      // ----------------------------------------------------------------------
      console.log('8. Action: Ctrl+Z (Undo) -> restores layout');
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'z',
        code: 'KeyZ',
        windowsVirtualKeyCode: 90,
        modifiers: 2 // Ctrl
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
      await delay(500);

      // Screenshot 6: After undo
      await capture('06_undo_restored.png');

      // ----------------------------------------------------------------------
      // STEP 10: Ctrl+Y (Redo) then Alt+ArrowUp nudge
      // ----------------------------------------------------------------------
      console.log('9. Action: Ctrl+Y (Redo) then Alt+ArrowUp nudge');
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'y',
        code: 'KeyY',
        windowsVirtualKeyCode: 89,
        modifiers: 2 // Ctrl
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'y', code: 'KeyY', windowsVirtualKeyCode: 89 });
      await delay(300);

      // Select note again
      await evaluate(`
        const notehead = document.querySelector('.score-event-group use[href*="notehead"]');
        if (notehead) {
          const rect = notehead.getBoundingClientRect();
          notehead.dispatchEvent(new MouseEvent('click', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true }));
        }
      `);
      await delay(300);

      // Nudge with Alt+ArrowUp
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'ArrowUp',
        code: 'ArrowUp',
        windowsVirtualKeyCode: 38,
        modifiers: 1 // Alt
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
      await delay(500);

      // Screenshot 7: Alt+Arrow nudge
      await capture('07_nudge_alt_arrow.png');

      // ----------------------------------------------------------------------
      // STEP 11: Ctrl+0 (or Reset Position button) resets override
      // ----------------------------------------------------------------------
      console.log('10. Action: Reset position via Ctrl+0');
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: '0',
        code: 'Digit0',
        windowsVirtualKeyCode: 48,
        modifiers: 2 // Ctrl
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '0', code: 'Digit0', windowsVirtualKeyCode: 48 });
      await delay(500);

      // Screenshot 8: After reset
      await capture('08_reset_position.png');

      // ----------------------------------------------------------------------
      // STEP 12: Narrow window (3 systems) & drag in System 3
      // ----------------------------------------------------------------------
      console.log('11. Action: Narrow window (3 systems) & drag in system 3');
      // Emulate narrow window (460px width)
      await send('Emulation.setDeviceMetricsOverride', {
        width: 460,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false
      });
      await delay(600);

      // Create new 12-measure score to force >= 3 systems at 460px
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yeni'));
        if (btn) btn.click();
      `);
      await delay(500);
      await evaluate(`
        const measuresInput = Array.from(document.querySelectorAll('input[type="number"]')).find(i => i.value === '8' || i.value === '4');
        if (measuresInput) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(measuresInput, '12');
          measuresInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      `);
      await delay(200);
      await submitModal();

      // Input mode ON
      await ensureInputMode(true);

      // System 3 (data-system-index="2")
      const sys3Info = await evaluate(`
        const sys3 = document.querySelector('g[data-system-index="2"]');
        if (!sys3) {
          const all = document.querySelectorAll('g[data-system-index]');
          return { found: false, count: all.length };
        }
        const rect = sys3.getBoundingClientRect();
        return {
          found: true,
          x: Math.round(rect.left + 140),
          y: Math.round(rect.top + 30)
        };
      `);
      console.log('   System 3 info:', JSON.stringify(sys3Info));

      if (sys3Info.found) {
        // Click to enter note in system 3
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sys3Info.x, y: sys3Info.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sys3Info.x, y: sys3Info.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sys3Info.x, y: sys3Info.y, button: 'left', clickCount: 1 });
        await delay(500);

        // Exit input mode
        await ensureInputMode(false);

        // Drag this note in system 3
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sys3Info.x, y: sys3Info.y, button: 'left', clickCount: 1 });
        await delay(100);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sys3Info.x + 15, y: sys3Info.y - 10, buttons: 1 });
        await delay(100);
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sys3Info.x + 15, y: sys3Info.y - 10, button: 'left', clickCount: 1 });
        await delay(500);

        // Screenshot 9: System 3 drag
        await capture('09_system3_drag.png');
      }

      // ----------------------------------------------------------------------
      // Performance Metrics Report
      // ----------------------------------------------------------------------
      const metrics = await evaluate(`
        function calcPercentiles(arr) {
          if (!arr || arr.length === 0) return { p50: 0, p95: 0, count: 0 };
          const sorted = [...arr].sort((a, b) => a - b);
          const p50 = sorted[Math.floor(sorted.length * 0.5)];
          const p95 = sorted[Math.floor(sorted.length * 0.95)];
          return { p50: Math.round(p50 * 100) / 100, p95: Math.round(p95 * 100) / 100, count: sorted.length };
        }
        return {
          pointermove: calcPercentiles(window.__m3cPerf.pointermoveTimes),
          click: calcPercentiles(window.__m3cPerf.clickTimes),
          drag: calcPercentiles(window.__m3cPerf.dragTimes)
        };
      `);

      console.log('====================================================');
      console.log('M3C_PERF_METRICS_REPORT:');
      console.log(JSON.stringify(metrics, null, 2));
      console.log('====================================================');

      chrome.kill();
      process.exit(0);
    } catch (err) {
      console.error('Error during test execution:', err);
      chrome.kill();
      process.exit(1);
    }
  });
});
