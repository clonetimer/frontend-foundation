import { existsSync } from 'node:fs';

// The caller deliberately passes only fixed pnpm subcommands/options. Restrict
// the Windows cmd.exe fallback to shell-safe tokens instead of constructing a
// command line from unchecked user input.
const SAFE_WINDOWS_ARG = /^[a-zA-Z0-9@._/:=+\-]+$/;

/**
 * Select an async, cross-platform pnpm invocation.
 *
 * pnpm exposes npm_execpath when a package script is run. When it points to a
 * JS entrypoint, invoking it with the current Node avoids .cmd shims entirely.
 * Windows fallback explicitly calls cmd.exe because Node 22+/24 cannot spawn
 * .cmd files directly without a shell (spawn EINVAL).
 */
export function planPnpmLaunch(args, {
  platform = process.platform,
  nodeExecutable = process.execPath,
  npmExecPath = process.env.npm_execpath,
  comSpec = process.env.ComSpec,
  fileExists = existsSync
} = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || !arg)) {
    throw new TypeError('pnpm arguments must be nonempty strings');
  }

  if (npmExecPath && /\.(?:cjs|mjs|js)$/i.test(npmExecPath) && fileExists(npmExecPath)) {
    return { command: nodeExecutable, args: [npmExecPath, ...args] };
  }

  if (platform === 'win32') {
    if (!args.every((arg) => SAFE_WINDOWS_ARG.test(arg))) {
      throw new TypeError('Unsafe pnpm argument for Windows cmd.exe fallback');
    }
    return { command: comSpec || 'cmd.exe', args: ['/d', '/s', '/c', `pnpm ${args.join(' ')}`] };
  }

  return { command: 'pnpm', args: [...args] };
}
