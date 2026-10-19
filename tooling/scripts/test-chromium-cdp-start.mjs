import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchChromiumCdp } from './chromium-cdp-start.mjs';

test('browser launcher refuses invalid or unsafe retry budgets', async () => {
  for (const args of [
    { executable:'',port:9397,profileRoot:'/tmp/x' },
    { executable:'missing',port:22,profileRoot:'/tmp/x' },
    { executable:'missing',port:9397,profileRoot:'' },
    { executable:'missing',port:9397,profileRoot:'/tmp/x',attempts:4 },
    { executable:'missing',port:9397,profileRoot:'/tmp/x',waitMs:0 }
  ]) {
    await assert.rejects(launchChromiumCdp(args), /Invalid isolated Chromium startup arguments/);
  }
});

test('missing Chrome binary fails boundedly with diagnostic instead of unhandled process error', async () => {
  const temporary=mkdtempSync(join(tmpdir(),'cdp-launch-unit-'));
  try {
    await assert.rejects(launchChromiumCdp({
      executable:'there-is-no-foundation-chromium-binary',
      port:9476,profileRoot:temporary,attempts:1,waitMs:1000
    }), /Chromium failed to start before browser assertions: attempt 1: spawn:.*ENOENT/);
  } finally {
    rmSync(temporary,{recursive:true,force:true});
  }
});
