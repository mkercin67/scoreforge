import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

const REPO_SHOTS_DIR = path.resolve('docs/screenshots/m5');
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
  '--remote-debugging-port=9598',
  '--disable-gpu',
  '--no-sandbox',
  '--window-size=1440,960',
  '--user-data-dir=C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_m5_e2e_v1',
]);

await new Promise((r) => setTimeout(r, 1500));

http.get('http://127.0.0.1:9598/json/list', (res) => {
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
      return new Promise((resolve, reject) => {
        const id = msgId++;
        callbacks.set(id, (resp) => {
          if (resp.error) {
            reject(new Error(`${method} failed: ${JSON.stringify(resp.error)}`));
          } else {
            resolve(resp.result);
          }
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    try {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('DOM.enable');

      ws.addEventListener('message', (evt) => {
        const m = JSON.parse(evt.data);
        if (m.method === 'Runtime.consoleAPICalled') {
          console.log('[Browser Console]', m.params.type, m.params.args.map((a) => a.value || a.description));
        }
        if (m.method === 'Runtime.exceptionThrown') {
          console.log('[Browser Exception]', m.params.exceptionDetails);
        }
      });

      async function evalJs(expr) {
        const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
        return res.result?.value;
      }

      async function takeShot(name) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const buf = Buffer.from(shot.data, 'base64');
        const repoPath = path.join(REPO_SHOTS_DIR, name);
        const artPath = path.join(ARTIFACT_DIR, name);
        fs.writeFileSync(repoPath, buf);
        fs.writeFileSync(artPath, buf);
        console.log(`[SCREENSHOT] Saved ${name} (${buf.length} bytes)`);
      }

      console.log('--- Starting Milestone 5 E2E Verification ---');

      // 1. Navigate to default startup score (should be empty 8-measure score, title="Yeni Eser")
      await send('Page.navigate', { url: 'http://localhost:5173/' });
      await new Promise((r) => setTimeout(r, 2000));
      await evalJs('window.__disableNativePickerForTest = true');

      const title0 = await evalJs('document.title');
      console.log('Initial document title:', title0);
      assert(title0.includes('Yeni Eser'), `Expected default score title 'Yeni Eser', got '${title0}'`);
      assert(!title0.startsWith('*'), 'Default score should not be dirty on startup');

      // Check toolbar buttons: Aç, Kaydet, Farklı kaydet, Eser bilgileri
      const btnTexts = await evalJs(
        'Array.from(document.querySelectorAll("header button")).map(b => b.textContent.trim())'
      );
      console.log('Toolbar buttons:', btnTexts);
      assert(btnTexts.some((b) => b.includes('Aç')), 'Toolbar must have "Aç" button');
      assert(btnTexts.some((b) => b.includes('Kaydet')), 'Toolbar must have "Kaydet" button');
      assert(btnTexts.some((b) => b.includes('Farklı kaydet')), 'Toolbar must have "Farklı kaydet" button');
      assert(btnTexts.some((b) => b.includes('Eser bilgileri')), 'Toolbar must have "Eser bilgileri" button');

      const notesCount1 = await evalJs('document.querySelectorAll("use[href*=\'notehead\']").length');
      console.log('Note count before shot 1:', notesCount1);
      assert(notesCount1 === 0, 'Clean empty score should have 0 notes');
      await takeShot('01_toolbar_save_load.png');

      // 2. Enter notes in input mode -> document becomes dirty (*)
      await evalJs('document.querySelector("button[title*=\'Ctrl+S\']").blur()');
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyN', key: 'n' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyN', key: 'n' });
      await new Promise((r) => setTimeout(r, 100));

      // Enter 4 quarter notes: C, D, E, F
      for (const k of ['KeyC', 'KeyD', 'KeyE', 'KeyF']) {
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: k, key: k.replace('Key', '').toLowerCase() });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: k, key: k.replace('Key', '').toLowerCase() });
        await new Promise((r) => setTimeout(r, 80));
      }

      const notesCount2 = await evalJs('document.querySelectorAll("use[href*=\'notehead\']").length');
      console.log('Note count after 4 notes:', notesCount2);
      assert(notesCount2 === 4, `Expected 4 notes, got ${notesCount2}`);

      const titleDirty = await evalJs('document.title');
      console.log('Dirty document title:', titleDirty);
      assert(titleDirty.startsWith('* '), `Document title must start with '* ', got '${titleDirty}'`);
      await takeShot('06_dirty_title_star.png');

      // 3. Save score -> trigger save -> status toast shows success, title loses '*'
      await evalJs(`
        const saveBtn = Array.from(document.querySelectorAll("header button")).find(b => b.textContent.includes("Kaydet"));
        if (saveBtn) saveBtn.click();
      `);
      await new Promise((r) => setTimeout(r, 500));

      const toastSuccess = await evalJs('document.querySelector(".scoreforge-toast")?.textContent');
      console.log('Save toast text:', toastSuccess);
      assert(toastSuccess && toastSuccess.toLowerCase().includes('kaydedildi'), `Expected 'Kaydedildi' toast, got '${toastSuccess}'`);

      const titleCleanAfterSave = await evalJs('document.title');
      console.log('Title after save:', titleCleanAfterSave);
      assert(!titleCleanAfterSave.startsWith('*'), 'Title must be clean after save');
      await takeShot('02_save_success_status.png');

      // 4. Test Unsaved Changes Dialog:
      // Edit a note to make dirty again
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyG', key: 'g' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyG', key: 'g' });
      await new Promise((r) => setTimeout(r, 100));
      const titleDirtyAgain = await evalJs('document.title');
      assert(titleDirtyAgain.startsWith('*'), 'Score should be dirty after entering 5th note');

      // Now click "Aç" button -> should open unsaved changes modal instead of opening picker directly
      await evalJs(`
        const openBtn = Array.from(document.querySelectorAll("header button")).find(b => b.textContent.includes("Aç"));
        if (openBtn) openBtn.click();
      `);
      await new Promise((r) => setTimeout(r, 400));

      const unsavedModalTitle = await evalJs('document.querySelector("[role=\'dialog\'] h3")?.textContent');
      console.log('Unsaved modal title:', unsavedModalTitle);
      assert(
        unsavedModalTitle && unsavedModalTitle.includes('Kaydedilmemiş'),
        `Expected unsaved modal, got '${unsavedModalTitle}'`
      );
      await takeShot('04_unsaved_changes_dialog.png');

      // Dismiss unsaved modal by clicking cancel button
      await evalJs('document.querySelector("[data-action=\'cancel-unsaved\']")?.click()');
      await new Promise((r) => setTimeout(r, 200));

      // 5. Test Corrupted File handling:
      // Trigger file loading of bad JSON
      await evalJs(`
        const input = document.querySelector("input[type='file']");
        const dt = new DataTransfer();
        const badFile = new File(['{"app":"scoreforge","savedAt":"2026-11-12T00:00:00Z","score":{"broken":true}}'], "corrupted.sfscore", { type: "application/json" });
        dt.items.add(badFile);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      `);
      await new Promise((r) => setTimeout(r, 500));

      const toastError = await evalJs('document.querySelector(".scoreforge-toast")?.textContent');
      console.log('Corrupted file error toast:', toastError);
      assert(
        toastError && (toastError.includes('Hata') || toastError.includes('schemaVersion') || toastError.includes('Geçersiz')),
        `Expected error toast for corrupted file, got '${toastError}'`
      );
      await takeShot('05_corrupted_file_error.png');

      // 6. Test Autosave & Recovery Modal:
      // Wait for autosave debounce (2s) to flush to IndexedDB
      console.log('Waiting 2.5s for autosave debounce write to IndexedDB...');
      await new Promise((r) => setTimeout(r, 2500));

      const autosaveMs = await evalJs('window.__scoreforge_last_autosave_ms');
      console.log(`Autosave write duration: ${autosaveMs ? autosaveMs.toFixed(2) + ' ms' : 'N/A'}`);

      // Test session restore modal by querying IndexedDB autosave record
      console.log('Testing session restore modal via IndexedDB record...');
      await evalJs('window.__checkAutosaveForTest()');
      await new Promise((r) => setTimeout(r, 600));

      const restoreModalTitle = await evalJs('document.querySelector("[role=\'dialog\'] h3")?.textContent');
      console.log('Restore prompt modal title:', restoreModalTitle);
      assert(
        restoreModalTitle && (restoreModalTitle.includes('Kurtarma') || restoreModalTitle.includes('Oturum')),
        `Expected session restore dialog, got '${restoreModalTitle}'`
      );
      await takeShot('03_restore_prompt.png');

      // Click "Kurtar" -> notes must be restored exactly
      await evalJs('document.querySelector("[data-action=\'restore-confirm\']")?.click()');
      await new Promise((r) => setTimeout(r, 500));

      const restoredNotesCount = await evalJs('document.querySelectorAll("use[href*=\'notehead\']").length');
      console.log('Restored notes count in DOM:', restoredNotesCount);
      assert(restoredNotesCount === 5, `Expected 5 restored notes, got ${restoredNotesCount}`);

      // 7. Measure 30-keystroke performance (p95 latency)
      console.log('Measuring p95 keydown-to-paint latency over 30 keystrokes...');
      await evalJs('window.__perf = []');
      for (let i = 0; i < 30; i++) {
        const k = ['KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG'][i % 5];
        await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: k, key: k.replace('Key', '').toLowerCase() });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', code: k, key: k.replace('Key', '').toLowerCase() });
        await new Promise((r) => setTimeout(r, 40));
      }
      await new Promise((r) => setTimeout(r, 500));

      const perfTimes = await evalJs('window.__perf || []');
      console.log(`Collected ${perfTimes.length} latency samples`);
      if (perfTimes.length > 0) {
        perfTimes.sort((a, b) => a - b);
        const p50 = perfTimes[Math.floor(perfTimes.length * 0.5)];
        const p95 = perfTimes[Math.floor(perfTimes.length * 0.95)];
        console.log(`Latency p50: ${p50.toFixed(2)} ms, p95: ${p95.toFixed(2)} ms`);
        assert(p95 <= 50, `p95 latency must be <= 50 ms, got ${p95}`);
      }

      console.log('All Milestone 5 verifications and screenshots completed successfully!');
      chrome.kill();
      process.exit(0);
    } catch (err) {
      console.error('Verification failed:', err);
      chrome.kill();
      process.exit(1);
    }
  });
});
