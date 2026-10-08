import { describe, expect, it } from 'vitest';
import { validateFileSelection } from '../src/validate-file-selection';

const file = (name: string, size: number, type: string) => ({ name, size, type });

describe('validateFileSelection', () => {
  it('accepts files matching extension and mime rules', () => {
    const result = validateFileSelection([
      file('report.csv', 10, 'text/csv'),
      file('photo.png', 10, 'image/png')
    ], { accept: ['.csv', 'image/*'] });
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects excessive count, size, and type', () => {
    const result = validateFileSelection([
      file('a.txt', 20, 'text/plain'),
      file('b.exe', 1000, 'application/octet-stream')
    ], { maxFiles: 1, maxSizeBytes: 100, accept: ['text/plain'] });
    expect(result.accepted).toHaveLength(1);
    expect(result.issues[0]?.code).toBe('too-many-files');
    expect(result.rejected[0]?.issues.map((item) => item.code)).toEqual(expect.arrayContaining(['too-many-files', 'file-too-large', 'file-type-not-allowed']));
  });
});
