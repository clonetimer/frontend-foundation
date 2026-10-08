import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Run pnpm in a cross-platform way.
 *
 * Corepack/npm-style pnpm launchers usually expose npm_execpath as a JS entrypoint,
 * while standalone pnpm binaries may expose a bare command name such as "pnpm".
 * Only JS entrypoints should be invoked through the current Node executable.
 */
export function runPnpm(args, options = {}) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && /\.(?:c?js|mjs)$/i.test(npmExecPath) && existsSync(npmExecPath)) {
    return execFileSync(process.execPath, [npmExecPath, ...args], options);
  }

  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  return execFileSync(command, args, {
    ...options,
    ...(process.platform === 'win32' ? { shell: true } : {})
  });
}
