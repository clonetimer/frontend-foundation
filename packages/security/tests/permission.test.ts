import { describe, expect, it } from 'vitest';
import { evaluatePermission } from '../src';

describe('evaluatePermission', () => {
  it('supports wildcard', () => expect(evaluatePermission('x.read', new Set(['*']))).toBe(true));
  it('supports all', () => expect(evaluatePermission({ all: ['a', 'b'] }, new Set(['a','b']))).toBe(true));
  it('supports any', () => expect(evaluatePermission({ any: ['a', 'b'] }, new Set(['b']))).toBe(true));
});
