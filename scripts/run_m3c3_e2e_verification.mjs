import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Murat/.gemini/antigravity/brain/0e08571a-6366-416f-a983-aad9fe52732a';
const DOCS_DIR = 'docs/screenshots/m3c3';

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
  '--remote-debugging-port=9587',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m3c3_e2e_v1',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9587/json/list', (res) => {
  let raw = '';
  res.on('data', (d) => (raw += d));
  res.on('end', async () => {
    const list = JSON.parse(raw);
    const pageTarget = list.find((t) => t.type === 'page') ?? list[0];
    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
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
      const trimmed = expression.trim();
      const hasStatement = /^(const|let|var|function|if|for|while|switch|return)\b|[;\n]/.test(trimmed);
      const wrapped = hasStatement
        ? `(() => {\n${trimmed}\n})()`
        : `(() => (\n${trimmed}\n))()`;
      const res = await send('Runtime.evaluate', {
        expression: wrapped,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.result?.exceptionDetails) {
        throw new Error(
          `Eval exception: ${res.result.exceptionDetails.text} ${res.result.exceptionDetails.exception?.description ?? ''}`
        );
      }
      return res.result?.result?.value;
    }

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    async function assertDomHasNotation(label, minNotes = 0, minRests = 0) {
      const counts = await evaluate(`
        const noteheads = document.querySelectorAll('svg use[href*="notehead"]').length;
        const rests = document.querySelectorAll('svg use[href*="rest"]').length;
        const hitAreas = document.querySelectorAll('svg .event-hit-area').length;
        return { noteheads, rests, hitAreas, total: noteheads + rests };
      `);
      console.log(`[DOM ASSERT] ${label}: noteheads=${counts.noteheads}, rests=${counts.rests}, hitAreas=${counts.hitAreas}`);
      if (counts.noteheads < minNotes || counts.rests < minRests || counts.total === 0) {
        throw new Error(`EMPTY OR MISSING NOTATION at "${label}": ${JSON.stringify(counts)}`);
      }
      return counts;
    }

    async function captureBase64(label, minNotes = 0, minRests = 0) {
      await assertDomHasNotation(label, minNotes, minRests);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      return shot.result.data;
    }

    async function captureAndSave(name, label, minNotes = 0, minRests = 0) {
      const b64 = await captureBase64(label, minNotes, minRests);
      saveScreenshot(name, b64);
    }

    async function clickNewScore() {
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('+ Yeni') || b.textContent.includes('New'))
        );
        if (!btn) throw new Error('New score button not found');
        btn.click();
      `);
      await delay(300);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) throw new Error('New score dialog not open');
        const btn = Array.from(modal.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('Oluştur') || b.textContent.includes('Create'))
        );
        if (!btn) throw new Error('Create button not found');
        btn.click();
      `);
      await delay(300);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
          const confirmBtn = Array.from(modal.querySelectorAll('button')).find(
            (b) => b.textContent && (b.textContent.includes('Onayla') || b.textContent.includes('Confirm') || b.textContent.includes('Oluştur'))
          );
          if (confirmBtn) confirmBtn.click();
        }
      `);
      await delay(400);
    }

    async function pressKey(code, key, modifiers = 0) {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        code,
        key,
        modifiers,
      });
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        code,
        key,
        modifiers,
      });
      await delay(120);
    }

    async function dragMouse(x0, y0, x1, y1, modifiers = 0, release = true) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: x0,
        y: y0,
        modifiers,
      });
      await delay(80);
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: x0,
        y: y0,
        button: 'left',
        clickCount: 1,
        modifiers,
      });
      await delay(80);
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const cx = x0 + ((x1 - x0) * i) / steps;
        const cy = y0 + ((y1 - y0) * i) / steps;
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: cx,
          y: cy,
          button: 'left',
          buttons: 1,
          modifiers,
        });
        await delay(25);
      }
      if (release) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: x1,
          y: y1,
          button: 'left',
          clickCount: 1,
          modifiers,
        });
        await delay(200);
      }
    }

    try {
      await send('Page.enable');
      await send('DOM.enable');
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });

      await send('Page.navigate', { url: 'http://localhost:4173/' });
      await delay(2200);

      // =========================================================================
      // 1) Legacy extreme overrides (dx=100, dx=-100, dy=-50) clamped visually
      // =========================================================================
      await clickNewScore();
      await pressKey('Digit5', '5'); // quarter
      await pressKey('KeyC', 'c');   // note 1 in m0
      await pressKey('Digit0', '0'); // rest 1 in m0
      await pressKey('KeyE', 'e');   // note 2 in m0
      await pressKey('KeyG', 'g');   // note 3 in m0
      await pressKey('KeyB', 'b');   // note 4 in m1
      await pressKey('Escape', 'Escape');
      await delay(200);

      const ids1 = await evaluate(`
        const groups = Array.from(document.querySelectorAll('svg g[data-event-id]'));
        return groups.map(g => g.getAttribute('data-event-id'));
      `);
      if (ids1.length < 5) throw new Error('Expected at least 5 events in score 1');

      await evaluate(`
        window.__applyRawOverrideForTest(${JSON.stringify(ids1[0])}, -100, -50);
        window.__applyRawOverrideForTest(${JSON.stringify(ids1[1])}, 100, -50);
        window.__applyRawOverrideForTest(${JSON.stringify(ids1[4])}, 100, -50);
      `);
      await delay(300);

      const boundsCheck1 = await evaluate(`
        const svg = document.querySelector('svg[viewBox]');
        const svgRect = svg.getBoundingClientRect();
        const headerEls = Array.from(svg.querySelectorAll('use[href*="Clef"], use[href*="timeSig"]'));
        const headerRight = Math.max(...headerEls.map(el => el.getBoundingClientRect().right));
        const noteEls = Array.from(svg.querySelectorAll('use[href*="notehead"], use[href*="rest"]'));
        const violations = [];
        for (const el of noteEls) {
          const r = el.getBoundingClientRect();
          if (r.left < headerRight) violations.push({ type: 'headerOverlap', left: r.left, headerRight });
          if (r.right > svgRect.right + 1 || r.top < svgRect.top - 1 || r.bottom > svgRect.bottom + 1) {
            violations.push({ type: 'svgOverflow', rect: r.toJSON(), svgRect: svgRect.toJSON() });
          }
        }
        return { headerRight, svgRect: { l: svgRect.left, r: svgRect.right, t: svgRect.top, b: svgRect.bottom }, violations };
      `);
      console.log('[CHECK 1] legacy bounds:', JSON.stringify(boundsCheck1));
      if (boundsCheck1.violations.length > 0) {
        throw new Error('Legacy bounds violation: ' + JSON.stringify(boundsCheck1.violations));
      }
      await captureAndSave('01_legacy_dx_clamped.png', '01_legacy_dx_clamped', 4, 1);

      // =========================================================================
      // 2) Alt+drag at limit with status message ("Sınıra ulaşıldı")
      // =========================================================================
      await clickNewScore();
      await pressKey('Digit5', '5');
      await pressKey('KeyE', 'e');
      await pressKey('Escape', 'Escape');
      await delay(200);

      const noteBox2 = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      `);
      // Alt+drag far right (+120px = +12 staff spaces -> exceeds +4 limit) and hold
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'AltLeft', key: 'Alt', modifiers: 1 });
      await dragMouse(noteBox2.cx, noteBox2.cy, noteBox2.cx + 120, noteBox2.cy, 1, false);
      await delay(200);

      const status2 = await evaluate(`document.body.innerText`);
      console.log('[CHECK 2] Limit status present:', status2.includes('Sınıra ulaşıldı') || status2.includes('Offset limit reached'));
      if (!status2.includes('Sınıra ulaşıldı') && !status2.includes('Offset limit reached')) {
        throw new Error('Expected offset limit status text during Alt+drag at limit');
      }
      await captureAndSave('02_alt_drag_at_limit.png', '02_alt_drag_at_limit', 1, 0);

      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: noteBox2.cx + 120,
        y: noteBox2.cy,
        button: 'left',
        clickCount: 1,
        modifiers: 1,
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'AltLeft', key: 'Alt', modifiers: 0 });
      await delay(200);

      // =========================================================================
      // 3) Hover over rest in input mode with Alt held (NO ghost note!)
      // =========================================================================
      await clickNewScore();
      await pressKey('Digit5', '5');
      await pressKey('KeyC', 'c');
      await pressKey('Digit0', '0'); // quarter rest in m0
      await delay(200);
      // Still in input mode! Find rest coordinates
      const restBox3 = await evaluate(`
        const rest = document.querySelector('svg use[href*="rest"]');
        const r = rest.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      `);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'AltLeft', key: 'Alt', modifiers: 1 });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: restBox3.cx,
        y: restBox3.cy,
        modifiers: 1,
      });
      await delay(200);
      const ghostCount3 = await evaluate(`return document.querySelectorAll('.score-ghost-note').length`);
      console.log('[CHECK 3] Ghost count with Alt held over rest in input mode:', ghostCount3);
      if (ghostCount3 !== 0) throw new Error('Ghost note must be hidden when Alt is held');
      await captureAndSave('03_input_mode_hover_rest_alt_no_ghost.png', '03_input_mode_hover_rest_alt_no_ghost', 1, 1);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'AltLeft', key: 'Alt', modifiers: 0 });
      await delay(150);

      // =========================================================================
      // 4) Grabbing note by stem (not notehead)
      // =========================================================================
      await clickNewScore();
      await pressKey('Digit4', '4'); // eighth note (has stem + flag!)
      await pressKey('KeyC', 'c');   // C5 (stem-down)
      await pressKey('KeyE', 'e');   // E5
      await pressKey('Escape', 'Escape');
      await delay(200);

      const stemBox4 = await evaluate(`
        const stem = document.querySelector('svg line[data-id$="-stem"]');
        const nh = document.querySelector('svg use[href*="notehead"]');
        const sr = stem.getBoundingClientRect();
        const nr = nh.getBoundingClientRect();
        // Grab near bottom/middle of stem away from notehead
        return {
          eventId: stem.getAttribute('data-event-id'),
          x: sr.left + sr.width / 2,
          y: sr.bottom - 4,
          nhBottom: nr.bottom,
        };
      `);
      console.log('[CHECK 4] Stem target:', JSON.stringify(stemBox4));
      // Plain vertical pitch drag starting on stem (-20px up -> +2 staff spaces higher pitch!) and hold for screenshot
      await dragMouse(stemBox4.x, stemBox4.y, stemBox4.x, stemBox4.y - 20, 0, false);
      await delay(200);
      const dragOverlayCount4 = await evaluate(`
        const overlay = document.querySelector('.score-drag-overlay');
        return overlay ? overlay.children.length : 0;
      `);
      console.log('[CHECK 4] Drag overlay children while grabbing stem:', dragOverlayCount4);
      if (dragOverlayCount4 === 0) throw new Error('Expected live drag overlay when grabbing note by stem');
      await captureAndSave('04_grab_note_by_stem.png', '04_grab_note_by_stem', 2, 0);
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: stemBox4.x,
        y: stemBox4.y - 20,
        button: 'left',
        clickCount: 1,
      });
      await delay(200);

      // =========================================================================
      // 5) Grabbing rest (Alt+drag rest upward)
      // =========================================================================
      await clickNewScore();
      await pressKey('Digit5', '5');
      await pressKey('Digit0', '0'); // quarter rest
      await pressKey('Escape', 'Escape');
      await delay(200);

      const restBox5 = await evaluate(`
        const rest = document.querySelector('svg use[href*="rest"]');
        const r = rest.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, id: rest.getAttribute('data-event-id') };
      `);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'AltLeft', key: 'Alt', modifiers: 1 });
      await dragMouse(restBox5.cx + 4, restBox5.cy + 6, restBox5.cx + 24, restBox5.cy - 20, 1, false);
      await delay(200);
      const dragStatus5 = await evaluate(`
        const overlay = document.querySelector('.score-drag-overlay');
        return { overlayChildren: overlay ? overlay.children.length : 0, text: document.body.innerText };
      `);
      console.log('[CHECK 5] Rest Alt+drag overlay:', dragStatus5.overlayChildren);
      if (dragStatus5.overlayChildren === 0) throw new Error('Expected rest Alt+drag overlay when grabbing rest');
      await captureAndSave('05_grab_rest.png', '05_grab_rest', 0, 1);

      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: restBox5.cx + 24,
        y: restBox5.cy - 20,
        button: 'left',
        clickCount: 1,
        modifiers: 1,
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'AltLeft', key: 'Alt', modifiers: 0 });
      await delay(200);

      // =========================================================================
      // 6) Clear-all button before / after composite screenshot
      // =========================================================================
      await clickNewScore();
      await pressKey('Digit5', '5');
      await pressKey('KeyC', 'c');
      await pressKey('Digit0', '0');
      await pressKey('KeyE', 'e');
      await pressKey('Escape', 'Escape');
      await delay(200);

      const ids6 = await evaluate(`
        return Array.from(document.querySelectorAll('svg g[data-event-id]')).map(g => g.getAttribute('data-event-id'));
      `);
      await evaluate(`
        window.__applyRawOverrideForTest(${JSON.stringify(ids6[0])}, 2.5, 0);
        window.__applyRawOverrideForTest(${JSON.stringify(ids6[1])}, -1.5, -2.5);
      `);
      await delay(250);

      const beforeClearBtnEnabled = await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('Tüm elle konumları sıfırla') || b.textContent.includes('Reset all manual positions'))
        );
        if (!btn) throw new Error('Reset-all button not found');
        return !btn.disabled;
      `);
      if (!beforeClearBtnEnabled) throw new Error('Reset-all button must be enabled when overrides exist');
      const b64Before = await captureBase64('06_before_clear_all', 2, 1);

      // Click Clear-all -> confirm dialog
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('Tüm elle konumları sıfırla') || b.textContent.includes('Reset all manual positions'))
        );
        btn.click();
      `);
      await delay(250);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        if (!modal) throw new Error('Confirmation dialog did not open');
        const confirmBtn = Array.from(modal.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('Onayla') || b.textContent.includes('Confirm') || b.textContent.includes('Sıfırla') || b.textContent.includes('Reset'))
        );
        if (!confirmBtn) throw new Error('Confirm button in reset-all dialog not found');
        confirmBtn.click();
      `);
      await delay(300);

      const afterClearBtnDisabled = await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('Tüm elle konumları sıfırla') || b.textContent.includes('Reset all manual positions'))
        );
        return !!btn && btn.disabled;
      `);
      console.log('[CHECK 6] Reset-all disabled after confirm:', afterClearBtnDisabled);
      if (!afterClearBtnDisabled) throw new Error('Reset-all button should be disabled after clearing all overrides');
      const b64After = await captureBase64('06_after_clear_all', 2, 1);

      // Combine Before (top) & After (bottom) cropped to toolbar+score cleanly inside Chromium canvas
      const compositeB64 = await evaluate(`
        return new Promise((resolve) => {
          const img1 = new Image();
          const img2 = new Image();
          let loaded = 0;
          const onLoad = () => {
            if (++loaded < 2) return;
            const cropH = 440;
            const c = document.createElement('canvas');
            c.width = img1.width;
            c.height = cropH * 2 + 12;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img1, 0, 0, img1.width, cropH, 0, 0, img1.width, cropH);
            ctx.drawImage(img2, 0, 0, img2.width, cropH, 0, cropH + 12, img2.width, cropH);
            ctx.fillStyle = '#1e3a8a';
            ctx.font = 'bold 16px sans-serif';
            ctx.fillText('ONCE (Overrides Active)', 16, 425);
            ctx.fillText('SONRA (Tum Elle Konumlar Sifirlandi)', 16, cropH + 12 + 425);
            resolve(c.toDataURL('image/png').replace(/^data:image\\/png;base64,/, ''));
          };
          img1.onload = onLoad;
          img2.onload = onLoad;
          img1.src = 'data:image/png;base64,' + ${JSON.stringify(b64Before)};
          img2.src = 'data:image/png;base64,' + ${JSON.stringify(b64After)};
        });
      `);
      saveScreenshot('06_clear_all_before_after.png', compositeB64);

      // =========================================================================
      // 7) Narrow window 385px: dragged note stays right of header (clef + timesig)
      // =========================================================================
      await send('Emulation.setDeviceMetricsOverride', {
        width: 385,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(300);
      await clickNewScore();
      await pressKey('Digit5', '5');
      await pressKey('KeyC', 'c');
      await pressKey('KeyD', 'd');
      await pressKey('KeyE', 'e');
      await pressKey('KeyF', 'f');
      await pressKey('KeyG', 'g');
      await pressKey('KeyA', 'a');
      await pressKey('Escape', 'Escape');
      await delay(300);

      const narrowFirstBox = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      `);
      // Alt+drag first note hard left (-80px) toward clef/header
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'AltLeft', key: 'Alt', modifiers: 1 });
      await dragMouse(narrowFirstBox.cx, narrowFirstBox.cy, narrowFirstBox.cx - 80, narrowFirstBox.cy, 1, true);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'AltLeft', key: 'Alt', modifiers: 0 });
      await delay(250);

      const narrowHeaderCheck = await evaluate(`
        const svg = document.querySelector('svg[viewBox]');
        const headerEls = Array.from(svg.querySelectorAll('use[href*="Clef"], use[href*="timeSig"]'));
        const headerRight = Math.max(...headerEls.map(el => el.getBoundingClientRect().right));
        const nh = document.querySelector('svg use[href*="notehead"]');
        const nhRect = nh.getBoundingClientRect();
        return { headerRight, noteLeft: nhRect.left, clearancePx: nhRect.left - headerRight };
      `);
      console.log('[CHECK 7] Narrow 385px clearance:', JSON.stringify(narrowHeaderCheck));
      if (narrowHeaderCheck.noteLeft <= narrowHeaderCheck.headerRight) {
        throw new Error('Narrow 385px note overlapped header: ' + JSON.stringify(narrowHeaderCheck));
      }
      await captureAndSave('07_narrow_385px_clamped_no_header_overlap.png', '07_narrow_385px_clamped_no_header_overlap', 6, 0);

      console.log('>>> ALL 7 M3c3 E2E VERIFICATIONS PASSED!');
    } catch (err) {
      console.error('E2E FAILED:', err);
      process.exitCode = 1;
    } finally {
      ws.close();
      chrome.kill();
      process.exit(process.exitCode || 0);
    }
  });
});
