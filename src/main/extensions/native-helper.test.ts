import { describe, expect, it } from 'vitest';
import { isHelperGone } from './native-helper';

describe('isHelperGone', () => {
  it('recognises a write to a process that has ended', () => {
    const error = Object.assign(new Error('write EPIPE'), {
      code: 'EPIPE',
      syscall: 'write',
    });
    expect(isHelperGone(error)).toBe(true);
  });

  it('leaves every other error to be reported', () => {
    expect(isHelperGone(new Error('write EPIPE'))).toBe(false);
    const other = Object.assign(new Error('nope'), {
      code: 'EACCES',
      syscall: 'write',
    });
    expect(isHelperGone(other)).toBe(false);
    expect(isHelperGone('EPIPE')).toBe(false);
  });
});
