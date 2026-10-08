import { describe, expect, it } from 'vitest';
import type { ApplicationShellProps } from '../src';
import { applicationShellPresets, resolveApplicationShell } from '../src';

function CustomShell({ children }: ApplicationShellProps) {
  return <>{children}</>;
}

describe('application shell resolution', () => {
  it('keeps sidebar as the compatibility default', () => {
    const resolved = resolveApplicationShell();
    expect(resolved.preset).toBe('sidebar');
    expect(resolved.options).toEqual({});
  });

  it('resolves every built-in shell preset', () => {
    expect(applicationShellPresets).toEqual(['sidebar', 'top-nav', 'workspace', 'bare']);
    for (const preset of applicationShellPresets) {
      expect(resolveApplicationShell(preset).preset).toBe(preset);
    }
  });

  it('allows project-owned shells without changing the router contract', () => {
    const resolved = resolveApplicationShell({ component: CustomShell, options: { showBreadcrumbs: false } });
    expect(resolved.preset).toBe('custom');
    expect(resolved.component).toBe(CustomShell);
    expect(resolved.options.showBreadcrumbs).toBe(false);
  });
});
