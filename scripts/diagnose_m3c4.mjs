import { spawn } from 'child_process';
import http from 'http';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9589',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m3c4_diag_v1',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9589/json/list', (res) => {
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

    async function clickNewScore() {
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('+ Yeni') || b.textContent.includes('New'))
        );
        btn.click();
      `);
      await delay(250);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        const btn = Array.from(modal.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('Oluştur') || b.textContent.includes('Create'))
        );
        btn.click();
      `);
      await delay(250);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
          const confirmBtn = Array.from(modal.querySelectorAll('button')).find(
            (b) => b.textContent && (b.textContent.includes('Onayla') || b.textContent.includes('Confirm') || b.textContent.includes('Oluştur'))
          );
          if (confirmBtn) confirmBtn.click();
        }
      `);
      await delay(300);
    }

    async function pressKey(code, key, modifiers = 0) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, modifiers });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, modifiers });
      await delay(100);
    }

    async function dragMouse(x0, y0, x1, y1, modifiers = 0) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, modifiers });
      await delay(50);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1, modifiers });
      await delay(50);
      for (let i = 1; i <= 10; i++) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: x0 + ((x1 - x0) * i) / 10,
          y: y0 + ((y1 - y0) * i) / 10,
          button: 'left',
          buttons: 1,
          modifiers,
        });
        await delay(20);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', clickCount: 1, modifiers });
      await delay(150);
    }

    function snapshotDomEvents() {
      return evaluate(`
        const groups = Array.from(document.querySelectorAll('svg g[data-event-id]'));
        const statusText = document.querySelector('[style*="border-top"]') ? document.body.innerText.split('\\n').pop() : '';
        return {
          totalGroups: groups.length,
          events: groups.map(g => {
            const uses = Array.from(g.querySelectorAll('use')).map(u => u.getAttribute('href'));
            return {
              id: g.getAttribute('data-event-id').slice(0, 8),
              uses,
            };
          }),
          statusLine: document.body.innerText.trim().split('\\n').slice(-1)[0],
        };
      `);
    }

    try {
      await send('Page.enable');
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await send('Page.navigate', { url: 'http://localhost:4173/' });
      await delay(2000);

      console.log('=== DIAGNOSE C.1 (OLD BUILD http://localhost:4173/) ===');
      await clickNewScore();
      await pressKey('Digit5', '5'); // quarter
      await pressKey('KeyC', 'c');   // Beat 1 quarter note C5 -> followed by quarter rest, half rest in M1
      await pressKey('Escape', 'Escape');
      await delay(200);

      const m1Geom = await evaluate(`
        const svg = document.querySelector('svg[viewBox]');
        const nh = svg.querySelector('use[href*="notehead"]');
        const nhR = nh.getBoundingClientRect();
        const barlines = Array.from(svg.querySelectorAll('line[data-id^="barline-"]')).map(l => l.getBoundingClientRect().left);
        const rests = Array.from(svg.querySelectorAll('use[href*="rest"]')).map(r => ({
          href: r.getAttribute('href'),
          left: r.getBoundingClientRect().left,
          right: r.getBoundingClientRect().right,
        }));
        return {
          nhX: nhR.left,
          nhRight: nhR.right,
          firstBarlineRightX: barlines[0],
          measureRoomSpaces: (barlines[0] - nhR.right) / 10,
          restsInMeasure: rests.slice(0, 2),
        };
      `);
      console.log('M1 geometry before drag:', JSON.stringify(m1Geom));

      // Drag quarter note far right (+300px = +30 spaces) with Alt held
      const dragStartX = m1Geom.nhX + 5;
      const nhCy = await evaluate(`
        const r = document.querySelector('svg use[href*="notehead"]').getBoundingClientRect();
        return r.top + r.height / 2;
      `);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'AltLeft', key: 'Alt', modifiers: 1 });
      await dragMouse(dragStartX, nhCy, dragStartX + 300, nhCy, 1);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'AltLeft', key: 'Alt', modifiers: 0 });
      await delay(200);

      const afterDrag = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        return {
          newNhX: r.left,
          movedPx: r.left - ${m1Geom.nhX},
          movedSpaces: (r.left - ${m1Geom.nhX}) / 10,
          status: document.body.innerText.trim().split('\\n').slice(-1)[0],
        };
      `);
      console.log('After Alt+drag +30 spaces:', JSON.stringify(afterDrag));

      console.log('\n=== DIAGNOSE C.2 (Clicking rests in select, input, position/Alt) ===');
      // Score 1: Fresh score (8 whole-measure rests)
      await clickNewScore();
      await pressKey('Escape', 'Escape'); // Select mode
      console.log('Fresh score baseline:', JSON.stringify((await snapshotDomEvents()).events.slice(0, 4)));

      const wholeRestRect = await evaluate(`
        const r = document.querySelector('svg use[href*="rest"]');
        const b = r.getBoundingClientRect();
        return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
      `);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: wholeRestRect.cx, y: wholeRestRect.cy, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: wholeRestRect.cx, y: wholeRestRect.cy, button: 'left', clickCount: 1 });
      await delay(150);
      console.log('After click whole-rest in SELECT:', JSON.stringify(await snapshotDomEvents()));

      // Score with notes containing quarter rest, eighth rest, 16th rest:
      await clickNewScore();
      // m0: quarter C + [quarter rest, half rest]
      await pressKey('Digit5', '5');
      await pressKey('KeyC', 'c');
      await pressKey('Digit5', '5');
      await pressKey('Digit0', '0');
      await pressKey('Digit6', '6');
      await pressKey('KeyE', 'e');   // completes m0, advances to m1
      // m1: 8th D + [8th rest, quarter rest, half rest]
      await pressKey('Digit4', '4');
      await pressKey('KeyD', 'd');
      await pressKey('Digit4', '4');
      await pressKey('Digit0', '0');
      await pressKey('Digit6', '6');
      await pressKey('KeyE', 'e');
      await pressKey('Digit5', '5');
      await pressKey('KeyE', 'e');   // completes m1, advances to m2
      // m2: 16th E + [16th rest, 8th rest, quarter rest, half rest]
      await pressKey('Digit3', '3');
      await pressKey('KeyE', 'e');
      await pressKey('Escape', 'Escape'); // Select mode
      await delay(150);

      console.log('Score with mixed rests baseline (SELECT mode):', JSON.stringify(await snapshotDomEvents()));

      const restTargets = await evaluate(`
        const allRests = Array.from(document.querySelectorAll('svg use[href*="rest"]'));
        const want = ['#glyph-restWhole', '#glyph-restQuarter', '#glyph-rest8th', '#glyph-rest16th'];
        return want.map(h => {
          const el = allRests.find(r => r.getAttribute('href') === h);
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { href: h, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
        }).filter(Boolean);
      `);
      console.log('Rest targets found:', JSON.stringify(restTargets.map(r => r.href)));

      for (const rt of restTargets) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rt.cx, y: rt.cy, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rt.cx, y: rt.cy, button: 'left', clickCount: 1 });
        await delay(120);
        const snap = await snapshotDomEvents();
        console.log(`Clicked ${rt.href} in SELECT -> count=${snap.totalGroups}, status="${snap.statusLine}"`);
      }

      // Now switch to Alt (position in old model) and click each rest:
      for (const rt of restTargets) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'AltLeft', key: 'Alt', modifiers: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rt.cx, y: rt.cy, button: 'left', clickCount: 1, modifiers: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rt.cx, y: rt.cy, button: 'left', clickCount: 1, modifiers: 1 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'AltLeft', key: 'Alt', modifiers: 0 });
        await delay(120);
        const snap = await snapshotDomEvents();
        console.log(`Clicked ${rt.href} with Alt -> count=${snap.totalGroups}, status="${snap.statusLine}"`);
      }

      // Now switch to INPUT mode (KeyN) and click each rest:
      await pressKey('KeyN', 'n');
      await delay(120);
      await pressKey('Digit3', '3');
      for (const rt of restTargets) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rt.cx, y: rt.cy, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rt.cx, y: rt.cy, button: 'left', clickCount: 1 });
        await delay(120);
        const snap = await snapshotDomEvents();
        console.log(`Clicked ${rt.href} in INPUT -> count=${snap.totalGroups}, events=${JSON.stringify(snap.events.map(e => e.id + ':' + e.uses[0]))}`);
      }
    } catch (err) {
      console.error('DIAG FAIL:', err);
      process.exitCode = 1;
    } finally {
      ws.close();
      chrome.kill();
      process.exit(process.exitCode || 0);
    }
  });
});
