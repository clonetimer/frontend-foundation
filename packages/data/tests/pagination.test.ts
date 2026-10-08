import { describe, expect, it } from 'vitest';
import { normalizePagination } from '../src/internal/normalize-pagination';

describe('normalizePagination', () => {
  it('clamps invalid values and keeps an empty result on page one', () => {
    expect(normalizePagination(-3, 0, -10)).toEqual({ page: 1, pageSize: 1, total: 0 });
  });

  it('clamps a page beyond the available page count', () => {
    expect(normalizePagination(99, 10, 21)).toEqual({ page: 3, pageSize: 10, total: 21 });
  });
});
