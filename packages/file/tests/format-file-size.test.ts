import { describe, expect, it } from 'vitest';
import { formatFileSize } from '../src/format-file-size';

describe('formatFileSize', () => {
  it('formats common byte values', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(10 * 1024)).toBe('10 KB');
  });
});
