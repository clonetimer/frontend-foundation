import { AppShell } from './app-shell';
import { BareShell } from './bare-shell';
import { TopNavShell } from './top-nav-shell';
import { WorkspaceShell } from './workspace-shell';
import type { ApplicationShell, ApplicationShellComponent, ApplicationShellOptions, ApplicationShellPreset } from './shell-types';

const presets: Record<ApplicationShellPreset, ApplicationShellComponent> = {
  sidebar: AppShell,
  'top-nav': TopNavShell,
  workspace: WorkspaceShell,
  bare: BareShell
};

export interface ResolvedApplicationShell {
  component: ApplicationShellComponent;
  options: Readonly<ApplicationShellOptions>;
  preset: ApplicationShellPreset | 'custom';
}

export function resolveApplicationShell(shell?: ApplicationShell): ResolvedApplicationShell {
  if (!shell) return { component: AppShell, options: {}, preset: 'sidebar' };
  if (typeof shell === 'string') return { component: presets[shell], options: {}, preset: shell };
  if (shell.component) return { component: shell.component, options: shell.options ?? {}, preset: 'custom' };
  const preset = shell.preset ?? 'sidebar';
  return { component: presets[preset], options: shell.options ?? {}, preset };
}

export const applicationShellPresets = Object.freeze(Object.keys(presets) as ApplicationShellPreset[]);
