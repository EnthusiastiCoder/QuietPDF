import { describe, expect, test } from 'vitest';
import { protectArgs, randomOwnerPassword } from '../../src/core/protect';
import { unlockArgs } from '../../src/core/unlock';

// qpdf itself runs in the browser (the e2e tests); in Node a failing qpdf call
// exits the process, so only the argument building is tested here.
describe('protect and unlock (core)', () => {
  test('AES-256 with the new encrypt syntax and permissions', () => {
    expect(protectArgs({ password: 'pw1', owner: 'own', allowPrint: false, allowCopy: true })).toEqual([
      '--encrypt',
      '--user-password=pw1',
      '--owner-password=own',
      '--bits=256',
      '--print=none',
      '--extract=y',
      '--',
    ]);
    expect(protectArgs({ password: 'a', owner: 'b' })).toContain('--print=full');
  });

  test('the random owner password is 32 hex chars and differs each time', () => {
    const a = randomOwnerPassword();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomOwnerPassword()).not.toBe(a);
  });

  test('unlock decrypts with the given password', () => {
    expect(unlockArgs('open123')).toEqual(['--decrypt', '--password=open123']);
  });
});
