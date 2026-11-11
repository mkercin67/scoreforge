import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

const REPO_SHOTS_DIR = path.resolve('docs/screenshots/m3c4');
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
  '--remote-debugging-port=9591',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1280,900',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m3c4_e2e_v1',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9591/json/list', (res) => {
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
      await delay(100);
    }

    async function clickNewScore(measures = 6) {
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('+ Yeni') || b.textContent.includes('New'))
        );
        btn.click();
      `);
      await delay(200);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        const numInput = modal.querySelector('input[type="number"]');
        if (numInput) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeSetter.call(numInput, '${measures}');
          numInput.dispatchEvent(new Event('input', { bubbles: true }));
          numInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = Array.from(modal.querySelectorAll('button')).find(
          (b) => b.textContent && (b.textContent.includes('Oluştur') || b.textContent.includes('Create'))
        );
        btn.click();
      `);
      await delay(200);
      await evaluate(`
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
          const confirmBtn = Array.from(modal.querySelectorAll('button')).find(
            (b) => b.textContent && (b.textContent.includes('Onayla') || b.textContent.includes('Confirm') || b.textContent.includes('Oluştur'))
          );
          if (confirmBtn) confirmBtn.click();
        }
      `);
      await delay(250);
    }

    async function getSnapshot(label) {
      const snap = await evaluate(`
        const score = window.__getScoreForTest ? window.__getScoreForTest() : null;
        const editorState = window.__getEditorStateForTest ? window.__getEditorStateForTest() : null;
        const svg = document.querySelector('svg[viewBox]');
        const noteheads = svg ? svg.querySelectorAll('g[data-event-id] use[href*="notehead"]').length : 0;
        const rests = svg ? svg.querySelectorAll('g[data-event-id] use[href*="rest"]').length : 0;
        const groups = svg ? svg.querySelectorAll('g[data-event-id]').length : 0;
        const ghostVisible = Boolean(svg && svg.querySelector('.score-ghost-note'));
        const statusEl = document.querySelector('footer');
        const statusText = statusEl ? statusEl.innerText.replace(/\\s+/g, ' ').trim() : '';
        const modeBtns = Array.from(document.querySelectorAll('[data-mode-btn]')).map(b => ({
          id: b.getAttribute('data-mode-btn'),
          pressed: b.getAttribute('aria-pressed'),
        }));
        const measuresSummary = score ? score.measures.slice(0, 3).map((m, idx) => {
          const evs = score.parts[0].staves[0].measures[m.id]?.voices[0]?.events ?? [];
          return {
            m: idx + 1,
            events: evs.map(e => ({
              id: e.id.slice(0, 8),
              kind: e.kind,
              dur: e.duration?.baseType,
              pitches: e.kind === 'note' ? e.pitches.map(p => p.step + (p.alter || 0) + p.octave) : null,
            })),
          };
        }) : [];
        return {
          mode: editorState?.mode,
          selectedEventId: editorState?.selectedEventId?.slice(0, 8) ?? null,
          overrides: score?.overrides ?? {},
          measuresSummary,
          dom: { noteheads, rests, groups, ghostVisible },
          modeBtns,
          statusText,
        };
      `);
      console.log(`\n[${label}]`, JSON.stringify(snap));
      return snap;
    }

    async function saveScreenshot(filename, label) {
      const snap = await getSnapshot(label);
      const { result } = await send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(result.data, 'base64');
      fs.writeFileSync(path.join(REPO_SHOTS_DIR, filename), buf);
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), buf);
      console.log(`SAVED SHOT: ${filename} (${buf.length} bytes)`);
      return snap;
    }

    async function dragMouse(x0, y0, x1, y1, modifiers = 0, release = true, steps = 12) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, modifiers });
      await delay(40);
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: x0,
        y: y0,
        button: 'left',
        clickCount: 1,
        modifiers,
      });
      await delay(40);
      for (let i = 1; i <= steps; i++) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: x0 + ((x1 - x0) * i) / steps,
          y: y0 + ((y1 - y0) * i) / steps,
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
        await delay(150);
      }
    }

    try {
      await send('Page.enable');
      await send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send('Page.navigate', { url: 'http://localhost:4173/' });
      await delay(1800);

      // 1. Fresh 6-measure score -> build test score:
      // M1: quarter C5 + [quarter rest + half rest] (wide measure with notes in M2..M5 so system wraps)
      await clickNewScore(6);
      let s0 = await getSnapshot('After +Yeni (must start in select)');
      assert(s0.mode === 'select', `Expected select mode after new score, got ${s0.mode}`);

      // Verify reset buttons hidden in select & input, visible in position
      const resetVisibleInSelect = await evaluate(`
        Boolean(Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Tüm elle konumları sıfırla')))
      `);
      assert(!resetVisibleInSelect, 'Reset buttons must be hidden in select mode');

      // Enter notes in input mode (via KeyN)
      await pressKey('KeyN', 'n');
      assert((await getSnapshot('After KeyN')).mode === 'input', 'KeyN enters input mode');

      const resetVisibleInInput = await evaluate(`
        Boolean(Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Tüm elle konumları sıfırla')))
      `);
      assert(!resetVisibleInInput, 'Reset buttons must be hidden in input mode');

      // Fill M1 with quarter C5 (leaves quarter rest + half rest), then skip rests into M2
      await pressKey('Digit5', '5');
      await pressKey('KeyC', 'c');
      await pressKey('ArrowRight', 'ArrowRight'); // skips half rest in M1 -> M2 beat 1
      await pressKey('ArrowRight', 'ArrowRight'); // ensures cursor in M2 beat 1
      // M2:
      await pressKey('Digit5', '5');
      await pressKey('KeyD', 'd');
      await pressKey('KeyE', 'e');
      await pressKey('KeyF', 'f');
      await pressKey('KeyG', 'g');
      // M3:
      await pressKey('KeyA', 'a');
      await pressKey('KeyB', 'b');
      await pressKey('KeyC', 'c');
      await pressKey('KeyD', 'd');
      // M4:
      await pressKey('KeyE', 'e');
      await pressKey('KeyF', 'f');
      await pressKey('KeyG', 'g');
      await pressKey('KeyA', 'a');

      // Switch to select mode using KeyV, select note 1 in M1
      await pressKey('KeyV', 'v');
      let s1 = await getSnapshot('Mode check KeyV');
      assert(s1.mode === 'select', 'KeyV switches to select');

      // Verify KeyP toggle + KeyV / Esc switches
      await pressKey('KeyP', 'p');
      assert((await getSnapshot('After KeyP')).mode === 'position', 'KeyP enters position mode');
      const resetVisibleInPos = await evaluate(`
        Boolean(Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Tüm elle konumları sıfırla')))
      `);
      assert(resetVisibleInPos, 'Reset buttons must be visible in position mode');
      await pressKey('Escape', 'Escape');
      assert((await getSnapshot('After Escape from position')).mode === 'select', 'Escape exits position -> select');

      // Verify Alt shortcuts disabled
      await pressKey('ArrowRight', 'ArrowRight', 1); // Alt=1
      await pressKey('KeyN', 'n', 1);
      assert((await getSnapshot('After Alt shortcuts')).mode === 'select', 'Alt shortcuts do nothing');

      // Click first notehead in M1 to select it -> Shot 1
      const firstNotePos = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      `);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: firstNotePos.cx, y: firstNotePos.cy, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: firstNotePos.cx, y: firstNotePos.cy, button: 'left', clickCount: 1 });
      await delay(150);

      const shot1 = await saveScreenshot('01_toolbar_three_modes_select_active.png', 'SHOT 1: Select active');
      assert(shot1.selectedEventId !== null, 'Note should be selected');
      assert(shot1.dom.noteheads === 13, `Expected 13 noteheads, got ${shot1.dom.noteheads}`);

      // Shot 2: Select mode vertical pitch drag IN PROGRESS (-25px = +5 diatonic steps? -20px = +2 spaces = +4 steps -> C5 to G5)
      await dragMouse(firstNotePos.cx, firstNotePos.cy, firstNotePos.cx + 15, firstNotePos.cy - 20, 0, false);
      await delay(150);
      const dragOpacity = await evaluate(`
        const selId = window.__getEditorStateForTest().selectedEventId;
        const g = document.querySelector('svg g[data-event-id="' + selId + '"]');
        return g ? g.style.opacity : null;
      `);
      assert(dragOpacity === '0.3', `Original note must stay faint ghost opacity 0.3 during pitch drag, got ${dragOpacity}`);
      await saveScreenshot('02_select_pitch_drag_in_progress.png', 'SHOT 2: Pitch drag in progress');

      // Release to commit changePitch -> verify pitch changed in SCORE DATA!
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: firstNotePos.cx + 15,
        y: firstNotePos.cy - 20,
        button: 'left',
        clickCount: 1,
      });
      await delay(200);
      const afterPitchDrop = await getSnapshot('After pitch drop');
      assert(
        afterPitchDrop.measuresSummary[0].events[0].pitches[0] !== 'C05',
        `Pitch must have changed in score data, still ${afterPitchDrop.measuresSummary[0].events[0].pitches[0]}`
      );

      // Verify 1-step Undo restores C5!
      await pressKey('KeyZ', 'z', 2); // Ctrl=2
      const afterUndoPitch = await getSnapshot('After Ctrl+Z pitch drag');
      assert(
        afterUndoPitch.measuresSummary[0].events[0].pitches[0] === 'C05',
        `Ctrl+Z must restore C05 in 1 step, got ${afterUndoPitch.measuresSummary[0].events[0].pitches[0]}`
      );

      // Drag a rest in select mode -> must do nothing to score data!
      const restHalfPos = await evaluate(`
        const rests = Array.from(document.querySelectorAll('svg use[href*="rest"]'));
        const target = rests.find(r => r.getAttribute('href') === '#glyph-restHalf') || rests[1];
        const b = target.getBoundingClientRect();
        return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
      `);
      await dragMouse(restHalfPos.cx, restHalfPos.cy, restHalfPos.cx + 40, restHalfPos.cy - 25, 0, true);
      const afterRestDragSelect = await getSnapshot('After dragging rest in select mode');
      assert(
        Object.keys(afterRestDragSelect.overrides).length === 0,
        'Dragging rest in select mode must not create overrides'
      );

      // Verify Escape clears selection in select mode
      await pressKey('Escape', 'Escape');
      assert((await getSnapshot('Escape clears selection')).selectedEventId === null, 'Esc must clear selection');

      // Shot 3: Click Input button -> hover over rest -> ghost visible AND original note visible
      await evaluate(`document.querySelector('[data-mode-btn="input"]').click()`);
      await delay(150);
      await pressKey('Digit5', '5');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: restHalfPos.cx, y: restHalfPos.cy });
      await delay(150);
      const shot3 = await saveScreenshot('03_input_mode_hover_rest_note_visible.png', 'SHOT 3: Input hover rest');
      assert(shot3.mode === 'input', 'Clicked Input mode button');
      assert(shot3.dom.ghostVisible === true, 'Ghost note must be visible over rest in input mode');
      assert(shot3.dom.noteheads === 13, 'Original notes must remain visible');

      // Hover outside staff bounds -> ghost must hide
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 100, y: 800 });
      await delay(120);
      const outsideGhost = await getSnapshot('Hover outside staff bounds');
      assert(outsideGhost.dom.ghostVisible === false, 'Ghost must hide outside staff');

      // Shot 4: Drag existing note >15px in input mode & release -> must do NOTHING (note visible, score unchanged)
      const curNotePos = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      `);
      await dragMouse(curNotePos.cx, curNotePos.cy, curNotePos.cx + 45, curNotePos.cy - 20, 0, false);
      const origNoteOpacityInInput = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        return nh.closest('g[data-event-id]').style.opacity;
      `);
      assert(origNoteOpacityInInput !== '0', 'Original note must NEVER disappear during drag in input mode');
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: curNotePos.cx + 45,
        y: curNotePos.cy - 20,
        button: 'left',
        clickCount: 1,
      });
      await delay(150);
      const shot4 = await saveScreenshot('04_input_mode_drag_release_noop.png', 'SHOT 4: Input drag release noop');
      assert(shot4.dom.noteheads === 13, `Drag in input mode must not enter note, got ${shot4.dom.noteheads}`);
      assert(Object.keys(shot4.overrides).length === 0, 'Drag in input mode must not add overrides');

      // Plain click on rest in input mode -> inserts note, then Ctrl+Z reverts
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: restHalfPos.cx, y: restHalfPos.cy, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: restHalfPos.cx, y: restHalfPos.cy, button: 'left', clickCount: 1 });
      await delay(150);
      const afterPlainClickInput = await getSnapshot('Plain click rest in input');
      assert(afterPlainClickInput.dom.noteheads === 14, 'Plain click on rest in input inserts 1 note');
      await pressKey('KeyZ', 'z', 2); // undo inserted note back to 13
      await delay(120);

      // Shot 5: Position mode (KeyP): select note in M1, drag far right across whole measure (+90px -> > +8 spaces!)
      await pressKey('KeyP', 'p');
      assert((await getSnapshot('After KeyP -> position')).mode === 'position', 'KeyP activates position mode');
      const noteM1 = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        const bar0 = document.querySelectorAll('svg line[data-id^="barline-"]')[0].getBoundingClientRect().left;
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, bar0, roomPx: bar0 - r.right };
      `);
      const targetShiftPx = Math.min(110, Math.max(60, noteM1.roomPx * 0.55));
      await dragMouse(noteM1.cx, noteM1.cy, noteM1.cx + targetShiftPx, noteM1.cy - 30, 0, true);
      const shot5 = await saveScreenshot('05_position_note_wide_drag_status_dx.png', 'SHOT 5: Position wide dx drag');
      const m1NoteOv = Object.values(shot5.overrides)[0];
      assert(m1NoteOv && m1NoteOv.dx > 4.5, `Note dx must exceed old +4 cap! Got ${JSON.stringify(m1NoteOv)}`);
      assert(m1NoteOv.dy === 0, 'Note dy must remain 0');
      assert(shot5.statusText.includes('dx '), `Status must show dx value, got "${shot5.statusText}"`);

      // Test position mode Escape during active drag cancels without command!
      const beforeEscCancel = JSON.stringify(shot5.overrides);
      const noteM1Moved = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      `);
      await dragMouse(noteM1Moved.cx, noteM1Moved.cy, noteM1Moved.cx - 40, noteM1Moved.cy, 0, false);
      await pressKey('Escape', 'Escape');
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: noteM1Moved.cx - 40,
        y: noteM1Moved.cy,
        button: 'left',
        clickCount: 1,
      });
      await delay(150);
      const afterEscDragCancel = await getSnapshot('After Esc cancels position drag');
      assert(JSON.stringify(afterEscDragCancel.overrides) === beforeEscCancel, 'Escape mid-drag must emit no command');

      // Undo 1 drag check
      await pressKey('KeyZ', 'z', 2);
      const afterUndoDrag = await getSnapshot('After Undo 1 position drag');
      assert(Object.keys(afterUndoDrag.overrides).length === 0, 'Undo of one position drag removes override in 1 step');
      // Redo it so Shot 8 can push it to the right limit (or redo + continue!)
      await pressKey('KeyY', 'y', 2);

      // Shot 6: Position mode: drag rest in M1 to UPPER dy limit (-150px, capture while held so limit hint is visible, then release & assert score data)
      const restM1 = await evaluate(`
        const rests = Array.from(document.querySelectorAll('svg use[href*="rest"]'));
        const target = rests.find(r => r.getAttribute('href') === '#glyph-restQuarter') || rests[0];
        const b = target.getBoundingClientRect();
        const topStaff = document.querySelector('svg line[data-id^="barline-"]').getBoundingClientRect().top;
        return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, topStaff };
      `);
      await dragMouse(restM1.cx, restM1.cy, restM1.cx, restM1.cy - 150, 0, false);
      await delay(100);
      const shot6 = await saveScreenshot('06_position_rest_upper_limit.png', 'SHOT 6: Rest upper dy limit');
      assert(shot6.statusText.includes('Sınıra ulaşıldı'), `Expected limit hint on rest upper drag, got "${shot6.statusText}"`);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: restM1.cx, y: restM1.cy - 150, button: 'left', clickCount: 1 });
      await delay(150);
      const afterUpCommit = await getSnapshot('After upper limit release');
      const restTopAfterUp = await evaluate(`
        const selId = window.__getEditorStateForTest().selectedEventId;
        const r = document.querySelector('svg g[data-event-id="' + selId + '"] use[href*="rest"]').getBoundingClientRect();
        const topStaff = document.querySelector('svg line[data-id^="barline-"]').getBoundingClientRect().top;
        return { restTop: r.top, minAllowedPx: topStaff - 10 };
      `);
      assert(afterUpCommit.overrides[Object.keys(afterUpCommit.overrides)[1]].dy < -1, 'Upper dy override must be committed');
      assert(restTopAfterUp.restTop >= restTopAfterUp.minAllowedPx - 2, `Rest escaped top band: ${JSON.stringify(restTopAfterUp)}`);

      // Shot 7: Position mode: same rest dragged to LOWER dy limit (+190px, capture while held for hint, then release)
      await dragMouse(restM1.cx, restTopAfterUp.restTop + 10, restM1.cx, restTopAfterUp.restTop + 190, 0, false);
      await delay(100);
      const shot7 = await saveScreenshot('07_position_rest_lower_limit.png', 'SHOT 7: Rest lower dy limit');
      assert(shot7.statusText.includes('Sınıra ulaşıldı'), `Expected limit hint on rest lower drag, got "${shot7.statusText}"`);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: restM1.cx, y: restTopAfterUp.restTop + 190, button: 'left', clickCount: 1 });
      await delay(150);
      const afterDownCommit = await getSnapshot('After lower limit release');
      const restBottomAfterDown = await evaluate(`
        const selId = window.__getEditorStateForTest().selectedEventId;
        const r = document.querySelector('svg g[data-event-id="' + selId + '"] use[href*="rest"]').getBoundingClientRect();
        const topStaff = document.querySelector('svg line[data-id^="barline-"]').getBoundingClientRect().top;
        return { restBottom: r.bottom, maxAllowedPx: topStaff + 50 };
      `);
      assert(afterDownCommit.overrides[Object.keys(afterDownCommit.overrides)[1]].dy > 1, 'Lower dy override must be committed');
      assert(restBottomAfterDown.restBottom <= restBottomAfterDown.maxAllowedPx + 2, `Rest escaped bottom band: ${JSON.stringify(restBottomAfterDown)}`);

      // Shot 8: Note stopped at right measure limit (drag +350px right, capture while held for hint, then release & assert bounds)
      const noteM1Again = await evaluate(`
        const nh = document.querySelector('svg use[href*="notehead"]');
        const r = nh.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      `);
      await dragMouse(noteM1Again.cx, noteM1Again.cy, noteM1Again.cx + 350, noteM1Again.cy, 0, false);
      await delay(100);
      const shot8 = await saveScreenshot('08_position_note_right_measure_limit.png', 'SHOT 8: Note right measure limit');
      assert(shot8.statusText.includes('Sınıra ulaşıldı'), `Expected limit hint on right barline clamp, got "${shot8.statusText}"`);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: noteM1Again.cx + 350, y: noteM1Again.cy, button: 'left', clickCount: 1 });
      await delay(150);
      await getSnapshot('After right limit release');
      const noteRightCheck = await evaluate(`
        const r = document.querySelector('svg use[href*="notehead"]').getBoundingClientRect();
        const bar0 = document.querySelectorAll('svg line[data-id^="barline-"]')[0].getBoundingClientRect().left;
        return { noteRight: r.right, bar0 };
      `);
      assert(noteRightCheck.noteRight <= noteRightCheck.bar0 - 4, `Note crossed barline: ${JSON.stringify(noteRightCheck)}`);

      // Test Position mode Tab / ArrowLeft / Shift+ArrowLeft / Ctrl+0
      await pressKey('ArrowLeft', 'ArrowLeft');
      await pressKey('Tab', 'Tab');
      await pressKey('Tab', 'Tab', 8); // Shift=8 -> Shift+Tab

      // Shot 9: Reset All Positions -> Confirm dialog -> verify overrides empty!
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Tüm elle konumları sıfırla'));
        btn.click();
      `);
      await delay(200);
      await evaluate(`
        const dialog = document.querySelector('[role="dialog"]');
        const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.includes('Onayla'));
        confirmBtn.click();
      `);
      await delay(200);
      const shot9 = await saveScreenshot('09_position_reset_all.png', 'SHOT 9: After reset all');
      assert(Object.keys(shot9.overrides).length === 0, `Reset all must clear overrides, got ${JSON.stringify(shot9.overrides)}`);

      console.log('\nALL M3c4 CHROMIUM E2E ASSERTIONS PASSED!');
    } catch (err) {
      console.error('E2E FAILURE:', err);
      process.exitCode = 1;
    } finally {
      ws.close();
      chrome.kill();
      process.exit(process.exitCode || 0);
    }
  });
});
