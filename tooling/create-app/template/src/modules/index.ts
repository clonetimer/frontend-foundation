import type { ApplicationModule } from '@foundation/app';

const discovered = import.meta.glob<{ module: ApplicationModule }>('./*/routes.ts', { eager: true });

export const modules = Object.entries(discovered)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([path, exports]) => {
    if (!exports.module) throw new Error(`Foundation module file ${path} must export const module`);
    return exports.module;
  });
