/** Deterministic, bounded Chrome CDP startup for real browser acceptance.
 *
 * Retry ONLY pre-test process startup; never retry an assertion or browser
 * interaction. Each attempt gets a new disposable profile subdirectory. The
 * caller owns the containing temporary profile root and cleanup.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function terminate(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'],
        { stdio: 'ignore', timeout: 5000 });
    } catch { child.kill(); }
  } else child.kill();
}

export async function launchChromiumCdp({
  executable, port, profileRoot, attempts = 3, waitMs = 20000
}) {
  if (typeof executable !== 'string' || !executable
      || !Number.isSafeInteger(port) || port < 1024 || port > 65535
      || typeof profileRoot !== 'string' || !profileRoot
      || !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3
      || !Number.isSafeInteger(waitMs) || waitMs < 1000 || waitMs > 60000) {
    throw new TypeError('Invalid isolated Chromium startup arguments');
  }
  const endpoint = 'http://127.0.0.1:' + port + '/json/version';
  // Avoid accidentally attaching to an already running external debugger.
  try {
    const preflight = await fetch(endpoint, { signal: globalThis.AbortSignal.timeout(1000) });
    if (preflight.ok) throw new Error('Refusing an occupied Chromium CDP port ' + port);
  } catch (error) {
    if (String(error).includes('Refusing an occupied')) throw error;
  }

  const diagnostics = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const profile = join(profileRoot, 'attempt-' + attempt);
    mkdirSync(profile, { recursive: true });
    const child = spawn(executable, [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--no-proxy-server',
      '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-extensions',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', failure = '', exited = false;
    child.stderr?.on('data', part => {
      // Limit captured output; never log HTTP request headers or page state.
      stderr = (stderr + String(part)).slice(-5000);
    });
    child.once('error', error => {
      exited = true;
      failure = 'spawn: ' + String(error);
    });
    child.once('exit', (code, signal) => {
      exited = true;
      failure = 'exit code=' + String(code) + ' signal=' + String(signal);
    });
    const until = Date.now() + waitMs;
    let lastProbe = '';
    while (Date.now() < until && !exited) {
      try {
        const r = await fetch(endpoint, { signal: globalThis.AbortSignal.timeout(1500) });
        if (r.ok) {
          const version = await r.json();
          if (typeof version.webSocketDebuggerUrl === 'string'
              && version.webSocketDebuggerUrl.startsWith('ws://')) {
            console.log('Chromium CDP ready on attempt ' + attempt);
            return child;
          }
          lastProbe = 'No WebSocket endpoint in CDP version';
        } else lastProbe = 'CDP response HTTP ' + r.status;
      } catch (error) { lastProbe = String(error); }
      await sleep(200);
    }
    diagnostics.push('attempt ' + attempt + ': ' + (failure || 'CDP deadline')
      + '; last probe=' + lastProbe
      + '; chrome stderr=' + stderr.slice(-2000).replace(/\r/g, ' '));
    terminate(child);
    await sleep(750);
  }
  throw new Error('Chromium failed to start before browser assertions: '
    + diagnostics.join(' | '));
}
