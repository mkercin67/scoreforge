import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Murat/.gemini/antigravity/brain/0e08571a-6366-416f-a983-aad9fe52732a';
const DOCS_DIR = 'docs/screenshots/m3c2';

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

function saveScreenshot(name, base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(path.join(DOCS_DIR, name), buf);
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), buf);
  console.log(`[SAVED] ${name} (${buf.length} bytes)`);
}

function calcPercentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return Math.round(sorted[idx] * 10) / 10;
}

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9585',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m3c2_e2e_v1',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9585/json/list', (res) => {
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

    try {
      await send('Page.enable');
      await send('DOM.enable');

      console.log('>>> [START] M3c2 Production Verification Scenario at http://localhost:4173/');
      await send('Page.navigate', { url: 'http://localhost:4173/' });
      await delay(2500);

      // Instrument performance trackers in window
      await evaluate(`
        window.__perf = {
          pointermove: [],
          click: [],
          drag: []
        };

        window.addEventListener('pointermove', (e) => {
          const t0 = performance.now();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (e.buttons > 0) {
                window.__perf.drag.push(performance.now() - t0);
              } else {
                window.__perf.pointermove.push(performance.now() - t0);
              }
            });
          });
        }, { passive: true });

        window.addEventListener('click', (e) => {
          const t0 = performance.now();
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.__perf.click.push(performance.now() - t0);
            });
          });
        }, { passive: true });
      `);

      // 1. Create a fresh score with Treble Clef, 4 measures
      console.log('1. Creating fresh score');
      await evaluate(`
        const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('+ Yeni') || b.textContent.includes('New'));
        if (newBtn) newBtn.click();
      `);
      await delay(400);
      await submitModal();

      // 2. Enter a note C5 using Note Input mode
      console.log('2. Entering note C5');
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', key: 'n', bubbles: true }));
      `);
      await delay(300);
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
      `);
      await delay(400);

      // Exit note input mode to inspect selection
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      `);
      await delay(300);

      // Collect performance samples for pointermove (>30 samples)
      console.log('Measuring pointermove performance (35 samples)...');
      for (let i = 0; i < 35; i++) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: 200 + i * 10,
          y: 250 + (i % 5) * 5,
        });
        await delay(16);
      }
      await delay(200);

      // Collect performance samples for clicks (>30 samples)
      console.log('Measuring click performance (35 samples)...');
      for (let i = 0; i < 35; i++) {
        await evaluate(`
          const noteEl = document.querySelector('g[data-event-id]');
          if (noteEl) {
            const evt = new MouseEvent('click', { bubbles: true, clientX: 250, clientY: 250 });
            window.dispatchEvent(evt);
          }
        `);
        await delay(20);
      }
      await delay(300);

      // Measure real drag pointermove performance (35 samples)
      console.log('Measuring real drag performance (35 samples)...');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 250, y: 250, button: 'left', clickCount: 1 });
      await delay(50);
      for (let i = 0; i < 35; i++) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: 250,
          y: 250 - (i % 8) * 4,
          button: 'left',
        });
        await delay(16);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 250, y: 250, button: 'left', clickCount: 1 });
      await delay(200);

      // ----------------------------------------------------------------------
      // SCREENSHOT 01: Drag in progress (moving note, faint original ghost, status shows target pitch)
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 01: Drag in progress');
      const notePos = await evaluate(`
        const noteEl = document.querySelector('g[data-event-id]');
        if (!noteEl) return null;
        const r = noteEl.getBoundingClientRect();
        return { eventId: noteEl.getAttribute('data-event-id'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      `);

      if (notePos) {
        // Start plain vertical drag (moving up by 20px = 2 staff spaces = 4 diatonic steps)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: notePos.x, y: notePos.y, button: 'left', clickCount: 1 });
        await delay(100);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: notePos.x, y: notePos.y - 20, button: 'left' });
        await delay(300);
        await capture('01_drag_in_progress.png');

        // ----------------------------------------------------------------------
        // SCREENSHOT 02: After drop, pitch changed
        // ----------------------------------------------------------------------
        console.log('SCREENSHOT 02: After drop, pitch changed');
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: notePos.x, y: notePos.y - 20, button: 'left', clickCount: 1 });
        await delay(400);
        await capture('02_after_drop_pitch_changed.png');
      }

      // ----------------------------------------------------------------------
      // SCREENSHOT 03: Notes dragged out of and into staff, ledger lines correct
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 03: Ledger lines in/out');
      const notePos2 = await evaluate(`
        const noteEl = document.querySelector('g[data-event-id]');
        if (!noteEl) return null;
        const r = noteEl.getBoundingClientRect();
        return { eventId: noteEl.getAttribute('data-event-id'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      `);
      if (notePos2) {
        // Drag note up above the staff (to A5/B5 where ledger line appears)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: notePos2.x, y: notePos2.y, button: 'left', clickCount: 1 });
        await delay(100);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: notePos2.x, y: notePos2.y - 35, button: 'left' });
        await delay(200);
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: notePos2.x, y: notePos2.y - 35, button: 'left', clickCount: 1 });
        await delay(400);
        await capture('03_ledger_lines_in_out.png');
      }

      // ----------------------------------------------------------------------
      // SCREENSHOT 04: Alt+drag in progress with dx value
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 04: Alt+drag in progress');
      const notePos3 = await evaluate(`
        const noteEl = document.querySelector('g[data-event-id]');
        if (!noteEl) return null;
        const r = noteEl.getBoundingClientRect();
        return { eventId: noteEl.getAttribute('data-event-id'), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      `);
      if (notePos3) {
        // Alt + drag to the right by 15px (dx = +1.50)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: notePos3.x, y: notePos3.y, button: 'left', clickCount: 1, modifiers: 1 }); // modifiers 1 = Alt
        await delay(100);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: notePos3.x + 15, y: notePos3.y, button: 'left', modifiers: 1 });
        await delay(300);
        await capture('04_alt_drag_dx_in_progress.png');

        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: notePos3.x + 15, y: notePos3.y, button: 'left', clickCount: 1, modifiers: 1 });
        await delay(400);
      }

      // ----------------------------------------------------------------------
      // SCREENSHOT 05: After Alt+Right nudge
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 05: After Alt+Right nudge');
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', altKey: true, bubbles: true }));
      `);
      await delay(400);
      await capture('05_alt_right_nudge.png');

      // ----------------------------------------------------------------------
      // SCREENSHOT 06: Rest moved with Alt+Up
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 06: Rest moved with Alt+Up');
      // Navigate to measure 2's rest using ArrowRight
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }));
      `);
      await delay(300);
      // Nudge rest up with Alt+ArrowUp
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', altKey: true, bubbles: true }));
      `);
      await delay(400);
      await capture('06_rest_alt_up.png');

      // ----------------------------------------------------------------------
      // SCREENSHOT 07: Alt+Up on a note showing the hint
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 07: Alt+Up on note showing hint');
      // Navigate back to the note in measure 1
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true }));
      `);
      await delay(300);
      // Press Alt+ArrowUp on the note!
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', altKey: true, bubbles: true }));
      `);
      await delay(400);
      await capture('07_alt_up_note_hint.png');

      // ----------------------------------------------------------------------
      // SCREENSHOT 08: Narrow window (385 px) fully inside the card
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 08: Narrow window (385 px)');
      await send('Emulation.setDeviceMetricsOverride', {
        width: 385,
        height: 700,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(600);
      await capture('08_narrow_card_fit.png');

      // Reset viewport to normal
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(500);

      // ----------------------------------------------------------------------
      // SCREENSHOT 09: Hover in input mode showing hovered measure in status bar
      // ----------------------------------------------------------------------
      console.log('SCREENSHOT 09: Hover in input mode');
      // Turn on Note Input Mode
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', key: 'n', bubbles: true }));
      `);
      await delay(300);

      // Move mouse over Measure 2
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: 450,
        y: 240,
      });
      await delay(400);
      await capture('09_hover_input_mode_measure.png');

      // ----------------------------------------------------------------------
      // Retrieve Performance Metrics
      // ----------------------------------------------------------------------
      const perf = await evaluate(`window.__perf`);
      const pmCount = perf.pointermove.length;
      const pmP50 = calcPercentile(perf.pointermove, 50);
      const pmP95 = calcPercentile(perf.pointermove, 95);
      const pmMax = calcPercentile(perf.pointermove, 100);

      const clkCount = perf.click.length;
      const clkP50 = calcPercentile(perf.click, 50);
      const clkP95 = calcPercentile(perf.click, 95);
      const clkMax = calcPercentile(perf.click, 100);

      const dragCount = perf.drag.length;
      const dragP50 = calcPercentile(perf.drag, 50);
      const dragP95 = calcPercentile(perf.drag, 95);
      const dragMax = calcPercentile(perf.drag, 100);

      console.log('\n========================================================');
      console.log('PERFORMANCE METRICS REPORT (Chromium Headless, Port 4173)');
      console.log('========================================================');
      console.log(`Method: double requestAnimationFrame paint cycle callback tracking`);
      console.log(`pointermove (n=${pmCount}): p50=${pmP50} ms, p95=${pmP95} ms, max=${pmMax} ms`);
      console.log(`click       (n=${clkCount}): p50=${clkP50} ms, p95=${clkP95} ms, max=${clkMax} ms`);
      console.log(`drag        (n=${dragCount}): p50=${dragP50} ms, p95=${dragP95} ms, max=${dragMax} ms`);
      console.log('========================================================\n');

    } catch (err) {
      console.error('Test execution failed:', err);
    } finally {
      ws.close();
      chrome.kill();
      process.exit(0);
    }
  });
});
