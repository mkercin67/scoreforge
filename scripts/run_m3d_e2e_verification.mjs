import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

const REPO_SHOTS_DIR = path.resolve('docs/screenshots/m3d');
const ARTIFACT_DIR = path.resolve(
  'C:/Users/Murat/.gemini/antigravity/brain/0e08571a-6366-416f-a983-aad9fe52732a'
);

fs.mkdirSync(REPO_SHOTS_DIR, { recursive: true });
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9594',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1440,960',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m3d_e2e_v2',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9594/json/list', (res) => {
  let raw = '';
  res.on('data', (d) => (raw += d));
  res.on('end', async () => {
    const list = JSON.parse(raw);
    const pageTarget = list.find((t) => t.type === 'page') ?? list[0];
    const ws = new globalThis.WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => {
      ws.onopen = resolve;
    });

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
      const hasStatement = /^(const|let|var|function|if|for|while|switch|return)\b|[;\n]/.test(
        trimmed
      );
      const wrapped = hasStatement ? `(() => {\n${trimmed}\n})()` : `(() => (\n${trimmed}\n))()`;
      const res = await send('Runtime.evaluate', {
        expression: wrapped,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.result?.exceptionDetails) {
        throw new Error(
          `Eval exception: ${res.result.exceptionDetails.text} ${
            res.result.exceptionDetails.exception?.description ?? ''
          }`
        );
      }
      return res.result?.result?.value;
    }

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    async function pressKey(code, key, modifiers = 0) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key, modifiers });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, modifiers });
      await delay(120);
    }

    async function setZoom200() {
      await evaluate(`
        const sel = document.getElementById('zoom-select');
        if (!sel) throw new Error('#zoom-select not found');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, '2');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      `);
      await delay(250);
    }

    /**
     * Asserts beam/flag/notehead counts inside an entire measure OR a specific event index range
     * [eventFrom, eventTo] within that measure, then captures a 200%-zoom screenshot tightly framed
     * around the target notation slice.
     */
    async function assertAndCapture(
      caseNum,
      name,
      filename,
      measureIdx,
      expected,
      noteheadSlice = null
    ) {
      const info = await evaluate(`
        const rects = Array.from(document.querySelectorAll('rect.measure-hit-area'))
          .filter((r) => !((r.getAttribute('data-measure-id') || '').endsWith('-thick')));
        const mRect = rects[${measureIdx}];
        if (!mRect) throw new Error('Measure rect not found at index ' + ${measureIdx});
        const mId = mRect.getAttribute('data-measure-id');
        const mx1 = parseFloat(mRect.getAttribute('x'));
        const mx2 = mx1 + parseFloat(mRect.getAttribute('width'));
        const sysG = mRect.closest('g[data-system-index]');
        if (!sysG) throw new Error('Parent system group not found');

        const allNoteheadsInMeasure = [];
        for (const u of Array.from(sysG.querySelectorAll('use'))) {
          const href = u.getAttribute('href') || '';
          const tr = u.getAttribute('transform') || '';
          const tm = tr.match(/translate\\(([\\d.-]+),\\s*([\\d.-]+)\\)/);
          if (!tm) continue;
          const ux = parseFloat(tm[1]);
          if (ux < mx1 - 2 || ux > mx2 + 2) continue;
          if (href.startsWith('#glyph-notehead')) {
            allNoteheadsInMeasure.push({
              ux,
              uy: parseFloat(tm[2]),
              eventId: u.getAttribute('data-event-id'),
            });
          }
        }
        allNoteheadsInMeasure.sort((a, b) => a.ux - b.ux);

        let rx1 = mx1;
        let rx2 = mx2;
        const slice = ${JSON.stringify(noteheadSlice)};
        if (slice) {
          const startNh = allNoteheadsInMeasure[slice[0]];
          const endNh = allNoteheadsInMeasure[slice[1]];
          if (!startNh || !endNh) {
            throw new Error('Invalid notehead slice ' + JSON.stringify(slice) + ' out of ' + allNoteheadsInMeasure.length);
          }
          rx1 = startNh.ux - 22;
          rx2 = endNh.ux + 38;
        }

        const beams = Array.from(sysG.querySelectorAll('path.scoreforge-beam'));
        const regionBeams = beams.filter((p) => {
          const d = p.getAttribute('d') || '';
          const m = d.match(/^M\\s+([\\d.-]+)/);
          if (!m) return false;
          const x0 = parseFloat(m[1]);
          return x0 >= rx1 - 4 && x0 <= rx2 + 4;
        });

        let lvl1 = 0, lvl2 = 0, lvl3 = 0;
        for (const p of regionBeams) {
          const lvl = p.getAttribute('data-beam-level');
          if (lvl === '1') lvl1++;
          else if (lvl === '2') lvl2++;
          else if (lvl === '3') lvl3++;
        }

        let flags = 0;
        let noteheads = 0;
        for (const u of Array.from(sysG.querySelectorAll('use'))) {
          const href = u.getAttribute('href') || '';
          const tr = u.getAttribute('transform') || '';
          const tm = tr.match(/translate\\(([\\d.-]+),\\s*([\\d.-]+)\\)/);
          if (!tm) continue;
          const ux = parseFloat(tm[1]);
          if (ux < rx1 - 2 || ux > rx2 + 2) continue;
          if (href.startsWith('#glyph-flag')) flags++;
          else if (href.startsWith('#glyph-notehead')) noteheads++;
        }

        mRect.scrollIntoView({ block: 'center', inline: 'center' });
        return { mId, lvl1, lvl2, lvl3, flags, noteheads, rx1, rx2, mx1, mx2 };
      `);

      await delay(140);

      const clip = await evaluate(`
        const rects = Array.from(document.querySelectorAll('rect.measure-hit-area'))
          .filter((r) => !((r.getAttribute('data-measure-id') || '').endsWith('-thick')));
        const mRect = rects[${measureIdx}];
        const mb = mRect.getBoundingClientRect();
        const scalePxPerSvg = mb.width / parseFloat(mRect.getAttribute('width'));
        const leftOffset = (${info.rx1} - ${info.mx1}) * scalePxPerSvg;
        const widthPx = (${info.rx2} - ${info.rx1}) * scalePxPerSvg;
        const rawX = Math.floor(mb.left + leftOffset - 24);
        const rawY = Math.floor(mb.top - 72);
        const cx = Math.max(0, rawX);
        const cy = Math.max(0, rawY);
        const cw = Math.min(1440 - cx, Math.max(260, Math.ceil(widthPx + 48)));
        const ch = Math.min(960 - cy, Math.ceil(mb.height + 144));
        return { x: cx, y: cy, width: cw, height: ch, scale: 1 };
      `);

      const summaryLine =
        `Case ${String(caseNum).padStart(2, '0')} (${name}) [M${measureIdx + 1}]: ` +
        `Expected(L1=${expected.lvl1}, L2=${expected.lvl2}, L3=${expected.lvl3}, flags=${expected.flags}, noteheads=${expected.noteheads}) | ` +
        `Actual(L1=${info.lvl1}, L2=${info.lvl2}, L3=${info.lvl3}, flags=${info.flags}, noteheads=${info.noteheads})`;
      console.log(summaryLine);

      assert(info.lvl1 === expected.lvl1, `${name}: expected L1=${expected.lvl1}, got ${info.lvl1}`);
      assert(info.lvl2 === expected.lvl2, `${name}: expected L2=${expected.lvl2}, got ${info.lvl2}`);
      assert(info.lvl3 === expected.lvl3, `${name}: expected L3=${expected.lvl3}, got ${info.lvl3}`);
      assert(info.flags === expected.flags, `${name}: expected flags=${expected.flags}, got ${info.flags}`);
      assert(info.noteheads === expected.noteheads, `${name}: expected noteheads=${expected.noteheads}, got ${info.noteheads}`);

      const shot = await send('Page.captureScreenshot', { format: 'png', clip });
      const buf = Buffer.from(shot.result.data, 'base64');
      fs.writeFileSync(path.join(REPO_SHOTS_DIR, filename), buf);
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
      return info;
    }

    try {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.navigate', { url: 'http://localhost:4173/?state=m3d_demo' });
      await delay(1200);

      await setZoom200();
      const globalCheck = await evaluate(`
        const svgTextGlyphs = document.querySelectorAll('svg text.scoreforge-glyph').length;
        const beams = document.querySelectorAll('path.scoreforge-beam').length;
        const rects = Array.from(document.querySelectorAll('rect.measure-hit-area'))
          .filter((r) => !((r.getAttribute('data-measure-id') || '').endsWith('-thick'))).length;
        const zoomVal = document.getElementById('zoom-select')?.value;
        return { svgTextGlyphs, beams, rects, zoomVal };
      `);
      console.log('TREBLE GLOBAL DOM CHECK (zoom 200%):', JSON.stringify(globalCheck));
      assert(globalCheck.svgTextGlyphs === 0, 'Expected zero SVG <text> glyph elements');
      assert(globalCheck.rects === 8, `Expected 8 measures, got ${globalCheck.rects}`);
      assert(globalCheck.zoomVal === '2', `Expected zoom 2, got ${globalCheck.zoomVal}`);

      // Case 1: 4/4: 4 eighths (M1 beats 0-1 -> 2 beam groups of 2)
      await assertAndCapture(1, '4/4: 4 eighths', '01_4_4_four_eighths.png', 0, {
        lvl1: 2, lvl2: 0, lvl3: 0, flags: 0, noteheads: 4,
      }, [0, 3]);

      // Case 2: 4/4: 8 sixteenths (M2 beats 0-1 -> 2 L1 + 2 L2)
      await assertAndCapture(2, '4/4: 8 sixteenths', '02_4_4_eight_sixteenths.png', 1, {
        lvl1: 2, lvl2: 2, lvl3: 0, flags: 0, noteheads: 8,
      }, [0, 7]);

      // Case 3: eighth + two sixteenths (M1 beat 2 -> 1 L1 + 1 L2 span, 3 noteheads)
      await assertAndCapture(3, 'eighth + two sixteenths', '03_eighth_two_sixteenths.png', 0, {
        lvl1: 1, lvl2: 1, lvl3: 0, flags: 0, noteheads: 3,
      }, [4, 6]);

      // Case 4: dotted eighth + sixteenth (M2 beat 2 -> 1 L1 + 1 L2 left stub, 2 noteheads)
      await assertAndCapture(4, 'dotted eighth + sixteenth', '04_dotted_eighth_sixteenth.png', 1, {
        lvl1: 1, lvl2: 1, lvl3: 0, flags: 0, noteheads: 2,
      }, [8, 9]);

      // Case 5: ascending scale of 8 eighths (M3)
      await assertAndCapture(5, 'ascending scale of 8 eighths', '05_ascending_scale_slope.png', 2, {
        lvl1: 4, lvl2: 0, lvl3: 0, flags: 0, noteheads: 8,
      });

      // Case 6: descending scale of 8 eighths (M4)
      await assertAndCapture(6, 'descending scale of 8 eighths', '06_descending_scale_slope.png', 3, {
        lvl1: 4, lvl2: 0, lvl3: 0, flags: 0, noteheads: 8,
      });

      // Case 7: group straddling middle line (M5 beats 0-1 -> 6 noteheads, L1=2, L2=1)
      await assertAndCapture(7, 'group straddling middle line', '07_straddling_middle_line.png', 4, {
        lvl1: 2, lvl2: 1, lvl3: 0, flags: 0, noteheads: 6,
      }, [0, 5]);

      // Case 8: 6/8 with 6 eighths (M6 -> 2 groups of 3)
      await assertAndCapture(8, '6/8 with 6 eighths', '08_6_8_six_eighths.png', 5, {
        lvl1: 2, lvl2: 0, lvl3: 0, flags: 0, noteheads: 6,
      });

      // Case 9: eighth rest in the middle of four eighths (M7 -> 2 broken groups)
      await assertAndCapture(9, 'eighth rest breaking four eighths', '09_eighth_rest_breaks_groups.png', 6, {
        lvl1: 2, lvl2: 0, lvl3: 0, flags: 0, noteheads: 4,
      });

      // Case 10: eighth chords (M5 beats 2-3 -> 4 chords * 3 noteheads = 12 noteheads, 2 L1 beams)
      await assertAndCapture(10, 'eighth chords', '10_eighth_chords.png', 4, {
        lvl1: 2, lvl2: 0, lvl3: 0, flags: 0, noteheads: 12,
      }, [6, 17]);

      // Case 11: single eighth after quarter keeps flag (M8)
      const m8Before = await assertAndCapture(11, 'single eighth after quarter keeps flag', '11_single_eighth_keeps_flag.png', 7, {
        lvl1: 1, lvl2: 0, lvl3: 0, flags: 1, noteheads: 5,
      });

      // Case 12: move second beamed note in M8 horizontally in Position mode (KeyP), beam follows
      await pressKey('KeyP', 'p');
      const targetNoteInfo = await evaluate(`
        const rects = Array.from(document.querySelectorAll('rect.measure-hit-area'))
          .filter((r) => !((r.getAttribute('data-measure-id') || '').endsWith('-thick')));
        const r8 = rects[7];
        r8.scrollIntoView({ block: 'center', inline: 'center' });
        const sysG = r8.closest('g[data-system-index]');
        const mx1 = parseFloat(r8.getAttribute('x'));
        const mx2 = mx1 + parseFloat(r8.getAttribute('width'));
        const beamedBeam = Array.from(sysG.querySelectorAll('path.scoreforge-beam')).find((p) => {
          const d = p.getAttribute('d') || '';
          const m = d.match(/^M\\s+([\\d.-]+)/);
          return m && parseFloat(m[1]) >= mx1 - 2 && parseFloat(m[1]) <= mx2 + 2;
        });
        const evIds = (beamedBeam.getAttribute('data-event-ids') || '').split(',');
        const secondEvId = evIds[1];
        const noteEl = sysG.querySelector('use[data-id="' + secondEvId + '"]');
        const nb = noteEl.getBoundingClientRect();
        const beamBeforeMatch = (beamedBeam.getAttribute('d') || '').match(/L\\s+([\\d.-]+)\\s+([\\d.-]+)/);
        return {
          secondEvId,
          startX: nb.left + nb.width / 2,
          startY: nb.top + nb.height / 2,
          beamRightXBefore: parseFloat(beamBeforeMatch[1]),
        };
      `);
      assert(targetNoteInfo && targetNoteInfo.secondEvId, 'Could not locate beamed note in M8 for drag');

      const { startX, startY, beamRightXBefore, secondEvId } = targetNoteInfo;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: startX, y: startY, button: 'left', clickCount: 1 });
      await delay(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX + 15, y: startY, buttons: 1 });
      await delay(40);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: startX + 30, y: startY, buttons: 1 });
      await delay(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: startX + 30, y: startY, button: 'left', clickCount: 1 });
      await delay(250);

      const postDragBeam = await evaluate(`
        const rects = Array.from(document.querySelectorAll('rect.measure-hit-area'))
          .filter((r) => !((r.getAttribute('data-measure-id') || '').endsWith('-thick')));
        const sysG = rects[7].closest('g[data-system-index]');
        const beamedBeam = Array.from(sysG.querySelectorAll('path.scoreforge-beam')).find((p) =>
          (p.getAttribute('data-event-ids') || '').includes('${secondEvId}')
        );
        const stemEl = sysG.querySelector('line[data-id="${secondEvId}-stem"]');
        const m = (beamedBeam.getAttribute('d') || '').match(/L\\s+([\\d.-]+)\\s+([\\d.-]+)/);
        return {
          beamRightXAfter: parseFloat(m[1]),
          stemXAfter: parseFloat(stemEl.getAttribute('x1')),
        };
      `);
      const dxPx = postDragBeam.beamRightXAfter - beamRightXBefore;
      console.log(`Position drag beam follow delta px: +${dxPx.toFixed(2)}, stemXAfter=${postDragBeam.stemXAfter.toFixed(2)}, beamRightXAfter=${postDragBeam.beamRightXAfter.toFixed(2)}`);
      assert(dxPx > 20, `Expected beam endpoint to move right >20px on drag, got ${dxPx}`);
      assert(Math.abs(postDragBeam.beamRightXAfter - (postDragBeam.stemXAfter + 1.2)) <= 1.5, 'Beam endpoint must stay aligned with moved stem');

      await assertAndCapture(12, 'beamed note moved in Position mode (beam follows)', '12_position_mode_beam_follows.png', 7, {
        lvl1: m8Before.lvl1, lvl2: m8Before.lvl2, lvl3: m8Before.lvl3, flags: m8Before.flags, noteheads: m8Before.noteheads,
      });

      // Case 13: Bass clef group (?state=m3d_bass -> M1 + M3 bass clef)
      await send('Page.navigate', { url: 'http://localhost:4173/?state=m3d_bass' });
      await delay(1200);
      await setZoom200();
      const hasBassClef = await evaluate(`document.querySelectorAll('use[href="#glyph-fClef"]').length`);
      assert(hasBassClef >= 1, 'Expected bass clef glyph #glyph-fClef in DOM');

      await assertAndCapture(13, 'bass clef group (M1 eighths)', '13_bass_clef_group.png', 0, {
        lvl1: 3, lvl2: 1, lvl3: 0, flags: 0, noteheads: 8,
      });

      console.log('ALL 13 M3d BROWSER ASSERTIONS PASSED SUCCESSFULLY!');
      ws.close();
      chrome.kill();
      process.exit(0);
    } catch (err) {
      console.error('E2E ERROR:', err);
      ws.close();
      chrome.kill();
      process.exit(1);
    }
  });
});
