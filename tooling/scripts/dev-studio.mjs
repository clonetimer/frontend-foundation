#!/usr/bin/env node
/** Development-only launcher: build shared packages once, then serve Showcase and Designer together. */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planPnpmLaunch } from './dev-studio-launch.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const children = new Set();
let stopping = false;

function run(args, name) {
  const { command, args: commandArgs } = planPnpmLaunch(args);
  let child;
  try {
    child = spawn(command, commandArgs, {
      cwd: root,
      stdio: 'inherit',
      windowsHide: process.platform === 'win32'
    });
  } catch (error) {
    console.error(`[studio] Could not start ${name}:`, error);
    return { done: Promise.resolve(1) };
  }

  children.add(child);
  const done = new Promise((resolveDone) => {
    let resolved = false;
    const finish = (status) => {
      if (resolved) return;
      resolved = true;
      children.delete(child);
      resolveDone(status);
    };
    child.once('error', (error) => {
      console.error(`[studio] ${name} failed: ${error.message}`);
      finish(1);
    });
    child.once('exit', (status, signal) => finish(status ?? (signal ? 1 : 0)));
  });
  return { done };
}

function terminateChild(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    // On Windows, stopping only the cmd.exe / pnpm parent may leave Vite alive.
    // taskkill /T terminates the descendant process tree as well.
    try {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore', windowsHide: true
      });
      killer.once('error', () => { try { child.kill(); } catch { /* exited */ } });
    } catch {
      try { child.kill(); } catch { /* exited */ }
    }
  } else {
    try { child.kill('SIGTERM'); } catch { /* exited */ }
  }
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (exitCode) process.exitCode = exitCode;
  for (const child of children) terminateChild(child);
}

process.on('SIGINT', () => stop(130));
process.on('SIGTERM', () => stop(143));

console.log('Building Foundation packages before launching the design studio…');
const buildStatus = await run(['build:packages'], 'package build').done;
if (buildStatus !== 0) {
  process.exitCode ||= buildStatus;
} else if (!stopping) {
  console.log('\nShowcase: http://localhost:5173/\nVisual Designer: http://localhost:5174/\nCtrl+C stops both development servers.\n');
  const servers = [
    { name: 'Showcase', ...run(['--filter', '@foundation/showcase', 'dev', '--port', '5173', '--strictPort'], 'Showcase') },
    { name: 'Designer', ...run(['--filter', '@foundation/designer', 'dev', '--port', '5174', '--strictPort'], 'Designer') }
  ];
  const first = await Promise.race(servers.map(async ({ name, done }) => ({ name, status: await done })));
  if (!stopping) {
    console.log(`[studio] ${first.name} exited (${first.status}); stopping the other server.`);
    stop(first.status);
  }
  await Promise.all(servers.map(({ done }) => done));
}
