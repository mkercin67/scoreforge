import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBenchmarkForUrl(port, url, screenshotName) {
  const userDataDir = `C:\\Users\\Murat\\AppData\\Local\\Temp\\chrome_bench_${Date.now()}`;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${userDataDir}`,
  ]);

  await sleep(1500);

  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let raw = '';
      res.on('data', (d) => (raw += d));
      res.on('end', async () => {
        try {
          const list = JSON.parse(raw);
          const target = list[0];
          const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);

          let msgId = 1;
          const pending = new Map();
          const send = (method, params = {}) => {
            const id = msgId++;
            return new Promise((resFn) => {
              pending.set(id, resFn);
              ws.send(JSON.stringify({ id, method, params }));
            });
          };

          ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.id && pending.has(data.id)) {
              const resFn = pending.get(data.id);
              pending.delete(data.id);
              resFn(data.result);
            }
          };

          ws.onopen = async () => {
            await send('Page.enable');
            await send('Runtime.enable');
            await send('Page.navigate', { url });
            await sleep(1500);

            // Turn on input mode if not on
            await send('Runtime.evaluate', {
              expression: `
                (() => {
                  window.__perf = [];
                  const buttons = Array.from(document.querySelectorAll('button'));
                  const btn = buttons.find(b => b.textContent.includes('Nota girişi'));
                  if (btn && !btn.className.includes('bg-blue')) {
                    btn.click();
                  }
                })()
              `,
            });
            await sleep(300);

            // Dispatch 20 note entries with spacing
            const noteCodes = ['KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyA'];

            for (const code of noteCodes) {
              await send('Runtime.evaluate', {
                expression: `
                  window.dispatchEvent(new KeyboardEvent('keydown', {
                    code: '${code}',
                    key: '${code.replace('Key', '').toLowerCase()}',
                    bubbles: true,
                    cancelable: true
                  }));
                `,
              });
              await sleep(80); // Wait for rAF paint cycle
            }

            await sleep(400);

            // Read stats from page
            const evalRes = await send('Runtime.evaluate', {
              expression: `
                (() => {
                  const arr = window.__perf || [];
                  const sorted = [...arr].sort((a, b) => a - b);
                  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
                  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
                  const svgCount = document.querySelectorAll('svg *').length;
                  const textCount = document.querySelectorAll('svg text').length;
                  return { count: arr.length, p50: Number(p50.toFixed(2)), p95: Number(p95.toFixed(2)), svgCount, textCount, samples: arr };
                })()
              `,
              returnByValue: true,
            });

            // Capture screenshot
            const shotRes = await send('Page.captureScreenshot', { format: 'png' });
            if (shotRes?.data) {
              const buf = Buffer.from(shotRes.data, 'base64');
              const outPath = path.join(process.cwd(), 'artifacts', screenshotName);
              fs.writeFileSync(outPath, buf);
              // Also copy to brain artifact dir
              const brainPath = `C:\\Users\\Murat\\.gemini\\antigravity\\brain\\0e08571a-6366-416f-a983-aad9fe52732a\\${screenshotName}`;
              fs.writeFileSync(brainPath, buf);
            }

            chrome.kill();
            resolve(evalRes.result.value);
          };
        } catch (err) {
          chrome.kill();
          reject(err);
        }
      });
    });
  });
}

async function main() {
  console.log('--- Benchmarking Default Mode (Vector Paths via <use>) ---');
  const pathStats = await runBenchmarkForUrl(9444, 'http://localhost:4173/', 'verify_paths_render.png');
  console.log('Paths Mode Results:', pathStats);

  await sleep(1000);

  console.log('--- Benchmarking Fallback Mode (?text via <text>) ---');
  const textStats = await runBenchmarkForUrl(9445, 'http://localhost:4173/?text', 'verify_text_render.png');
  console.log('Text Mode Results:', textStats);

  fs.writeFileSync('bench_compare_results.json', JSON.stringify({ pathStats, textStats }, null, 2));
  console.log('Comparison complete!');
}

main().catch(console.error);
