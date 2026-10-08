import { AppError } from '@foundation/core';
import type { ZodType } from 'zod';

export async function loadRuntimeConfig<TConfig>(url: string, schema: ZodType<TConfig>): Promise<TConfig> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch (cause) {
    throw new AppError({ kind: 'configuration', message: `Unable to load runtime config from ${url}`, cause });
  }
  if (!response.ok) {
    throw new AppError({ kind: 'configuration', message: `Runtime config returned HTTP ${response.status}`, status: response.status });
  }
  let payload: unknown;
  try { payload = await response.json(); }
  catch (cause) { throw new AppError({ kind: 'configuration', message: 'Runtime config is not valid JSON', cause }); }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new AppError({ kind: 'configuration', message: 'Runtime config validation failed', detail: result.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ') });
  }
  return result.data;
}
