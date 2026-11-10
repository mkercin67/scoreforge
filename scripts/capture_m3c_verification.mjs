import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Murat/.gemini/antigravity/brain/0e08571a-6366-416f-a983-aad9fe52732a';
const DOCS_DIR = 'docs/screenshots/m3c';

function saveScreenshot(name, base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(path.join(DOCS_DIR, name), buf);
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), buf);
  console.log(`Saved ${name}`);
}

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9564',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m3c_capture3',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9564/json/list', (res) => {
  let raw = '';
  res.on('data', (d) => (raw += d));
  res.on('end', async () => {
    const list = JSON.parse(raw);
    const ws = new globalThis.WebSocket(list[0].webSocketDebuggerUrl);

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
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      return res.result?.result?.value;
    }

    async function capture(name) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      saveScreenshot(name, res.result.data);
    }

    function delay(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    ws.onopen = async () => {
      console.log('Connected to Chrome DevTools Protocol');
      await send('Page.navigate', { url: 'http://localhost:5173/' });
      await delay(2000);

      // --- 1. Hover ghost in treble ---
      console.log('1. Hover ghost in treble');
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nota girişi'));
        const isActive = btn && btn.style.backgroundColor.includes('rgb(37, 99, 235)');
        if (!isActive) btn.click();
      `);
      await delay(400);

      await evaluate(`
        const svg = document.querySelector('svg');
        const rect = svg.getBoundingClientRect();
        const targetX = rect.left + 220;
        const targetY = rect.top + 65; // G4 / E4
        svg.dispatchEvent(new PointerEvent('pointerenter', { clientX: targetX, clientY: targetY, bubbles: true }));
        svg.dispatchEvent(new PointerEvent('pointermove', { clientX: targetX, clientY: targetY, bubbles: true }));
      `);
      await delay(400);
      await capture('01_hover_ghost_treble.png');

      // --- 2. Note entered by click ---
      console.log('2. Note entered by click');
      await evaluate(`
        const svg = document.querySelector('svg');
        const rect = svg.getBoundingClientRect();
        const targetX = rect.left + 220;
        const targetY = rect.top + 65;
        svg.dispatchEvent(new MouseEvent('click', { clientX: targetX, clientY: targetY, bubbles: true }));
      `);
      await delay(500);
      await capture('02_note_entered_click.png');

      // --- 3. Same in bass clef ---
      console.log('3. Same in bass clef');
      // Create new bass clef score
      await evaluate(`
        const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yeni'));
        newBtn.click();
      `);
      await delay(400);
      await evaluate(`
        const bassRadio = document.querySelectorAll('input[type="radio"]')[1];
        if (bassRadio) bassRadio.click();
        const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Oluştur');
        if (createBtn) createBtn.click();
      `);
      await delay(700);

      // Ensure input mode is ON in new bass score
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nota girişi'));
        const isActive = btn && btn.style.backgroundColor.includes('rgb(37, 99, 235)');
        if (!isActive) btn.click();
      `);
      await delay(300);

      // Hover and click in bass clef (D3 middle line)
      await evaluate(`
        const svg = document.querySelector('svg');
        const rect = svg.getBoundingClientRect();
        const targetX = rect.left + 150;
        const targetY = rect.top + 60;
        svg.dispatchEvent(new PointerEvent('pointerenter', { clientX: targetX, clientY: targetY, bubbles: true }));
        svg.dispatchEvent(new PointerEvent('pointermove', { clientX: targetX, clientY: targetY, bubbles: true }));
        svg.dispatchEvent(new MouseEvent('click', { clientX: targetX, clientY: targetY, bubbles: true }));
      `);
      await delay(600);
      await capture('03_same_in_bass_clef.png');

      // --- 4. Rejected click with status message ---
      console.log('4. Rejected click with status message');
      // Select whole note duration (Digit7), but measure 1 already has 1 quarter note
      await evaluate(`
        const wholeBtn = Array.from(document.querySelectorAll('button')).find(b => b.title && b.title.includes('Birlik (7)'));
        if (wholeBtn) wholeBtn.click();
        const svg = document.querySelector('svg');
        const rect = svg.getBoundingClientRect();
        svg.dispatchEvent(new MouseEvent('click', { clientX: rect.left + 200, clientY: rect.top + 60, bubbles: true }));
      `);
      await delay(400);
      await capture('04_rejected_click_status.png');

      // --- 5. Note dragged ---
      console.log('5. Note dragged');
      // Exit input mode, select the note
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      `);
      await delay(300);
      await evaluate(`
        const noteEl = document.querySelector('.score-event-group');
        if (noteEl) {
          const rect = noteEl.getBoundingClientRect();
          noteEl.dispatchEvent(new MouseEvent('click', { clientX: rect.left + 5, clientY: rect.top + 5, bubbles: true }));
        }
      `);
      await delay(300);
      // Drag note (+20px X, +15px Y)
      await evaluate(`
        const noteEl = document.querySelector('.score-event-group');
        if (noteEl) {
          const rect = noteEl.getBoundingClientRect();
          const startX = rect.left + 5;
          const startY = rect.top + 5;
          noteEl.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, button: 0, bubbles: true }));
          window.dispatchEvent(new PointerEvent('pointermove', { clientX: startX + 25, clientY: startY + 20, bubbles: true }));
          window.dispatchEvent(new PointerEvent('pointerup', { clientX: startX + 25, clientY: startY + 20, bubbles: true }));
        }
      `);
      await delay(500);
      await capture('05_note_dragged.png');

      // --- 6. Undo restored ---
      console.log('6. Undo restored');
      await evaluate(`
        const undoBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Geri Al'));
        if (undoBtn) undoBtn.click();
      `);
      await delay(400);
      await capture('06_undo_restored.png');

      // --- 7. Nudge with Alt+Arrow ---
      console.log('7. Nudge with Alt+Arrow');
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown', key: 'ArrowDown', altKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', altKey: true, bubbles: true }));
      `);
      await delay(400);
      await capture('07_nudge_alt_arrow.png');

      // --- 8. Reset position ---
      console.log('8. Reset position');
      await evaluate(`
        const resetBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Konumu sıfırla'));
        if (resetBtn && !resetBtn.disabled) {
          resetBtn.click();
        } else {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit0', key: '0', ctrlKey: true, bubbles: true }));
        }
      `);
      await delay(400);
      await capture('08_reset_position.png');

      // --- 9. Score with 3 systems and drag in system 3 ---
      console.log('9. Score with 3 systems and drag in system 3');
      // Create new score with 24 measures to ensure 3+ systems
      await evaluate(`
        const newBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Yeni'));
        newBtn.click();
      `);
      await delay(400);
      await evaluate(`
        const input = document.querySelector('#measures-input');
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, '24');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Oluştur');
        if (createBtn) createBtn.click();
      `);
      await delay(800);

      // Narrow window width to 650px to wrap systems
      await send('Emulation.setDeviceMetricsOverride', {
        width: 650,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(800);

      // Enter a note in system 3
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nota girişi'));
        const isActive = btn && btn.style.backgroundColor.includes('rgb(37, 99, 235)');
        if (!isActive) btn.click();
      `);
      await delay(300);

      await evaluate(`
        const sys3 = document.querySelector('g[data-system-index="2"]');
        if (sys3) {
          const rect = sys3.getBoundingClientRect();
          sys3.dispatchEvent(new PointerEvent('pointerenter', { clientX: rect.left + 100, clientY: rect.top + 30, bubbles: true }));
          sys3.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + 100, clientY: rect.top + 30, bubbles: true }));
          sys3.dispatchEvent(new MouseEvent('click', { clientX: rect.left + 100, clientY: rect.top + 30, bubbles: true }));
        }
      `);
      await delay(600);

      // Exit input mode, select the note in system 3, and drag it
      await evaluate(`
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
      `);
      await delay(300);
      await evaluate(`
        const sys3 = document.querySelector('g[data-system-index="2"]');
        const noteEl = sys3?.querySelector('.score-event-group');
        if (noteEl) {
          const rect = noteEl.getBoundingClientRect();
          const startX = rect.left + 5;
          const startY = rect.top + 5;
          noteEl.dispatchEvent(new PointerEvent('pointerdown', { clientX: startX, clientY: startY, button: 0, bubbles: true }));
          window.dispatchEvent(new PointerEvent('pointermove', { clientX: startX + 25, clientY: startY - 15, bubbles: true }));
          window.dispatchEvent(new PointerEvent('pointerup', { clientX: startX + 25, clientY: startY - 15, bubbles: true }));
        }
      `);
      await delay(600);
      await capture('09_system3_drag.png');

      console.log('All 9 verification screenshots captured successfully!');
      chrome.kill();
      process.exit(0);
    };
  });
});
