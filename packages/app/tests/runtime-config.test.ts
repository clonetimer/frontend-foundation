import { afterEach, describe, expect, it, vi } from 'vitest';
import { foundationRuntimeConfigSchema } from '../src';
import { loadRuntimeConfig } from '../src/runtime-config/load-runtime-config';

const valid = {
  app: { name: 'Test', environment: 'test' },
  api: { baseUrl: '/api' },
  router: {},
  ui: {},
  features: {}
};

afterEach(() => vi.unstubAllGlobals());

describe('loadRuntimeConfig', () => {
  it('applies schema defaults at runtime', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(valid), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })));

    const config = await loadRuntimeConfig('/runtime-config.json', foundationRuntimeConfigSchema);
    expect(config.api.timeoutMs).toBe(30_000);
    expect(config.router.mode).toBe('browser');
    expect(config.ui.theme).toBe('system');
    expect(config.ui.density).toBe('default');
  });

  it('converts schema validation failures into configuration errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...valid, api: { baseUrl: '' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })));

    await expect(loadRuntimeConfig('/runtime-config.json', foundationRuntimeConfigSchema)).rejects.toMatchObject({
      kind: 'configuration',
      message: 'Runtime config validation failed'
    });
  });

  it('converts invalid JSON into configuration errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{invalid', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })));

    await expect(loadRuntimeConfig('/runtime-config.json', foundationRuntimeConfigSchema)).rejects.toMatchObject({
      kind: 'configuration',
      message: 'Runtime config is not valid JSON'
    });
  });
});
