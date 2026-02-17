/**
 * Protect (decision 13): AES-256 encryption with qpdf. The user password opens
 * the file; the owner password (random when not given) guards the permissions.
 * No password cracking anywhere: this only adds a password.
 */
import { runQpdf } from '../lib/qpdf-setup';

export interface ProtectOptions {
  /** Password needed to open the file. */
  password: string;
  /** Owner password; a random one is generated when empty. */
  owner?: string;
  /** Allow printing (default true). */
  allowPrint?: boolean;
  /** Allow copying text and images (default true). */
  allowCopy?: boolean;
}

/** A random owner password (128 bits, hex). */
export function randomOwnerPassword(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** The qpdf arguments for AES-256 encryption (exposed for unit tests). */
export function protectArgs(opts: ProtectOptions & { owner: string }): string[] {
  return [
    '--encrypt',
    `--user-password=${opts.password}`,
    `--owner-password=${opts.owner}`,
    '--bits=256',
    `--print=${opts.allowPrint === false ? 'none' : 'full'}`,
    `--extract=${opts.allowCopy === false ? 'n' : 'y'}`,
    '--',
  ];
}

export async function protectPdf(bytes: Uint8Array, opts: ProtectOptions): Promise<Uint8Array> {
  if (!opts.password) throw new Error('A password is required.');
  const owner = opts.owner || randomOwnerPassword();
  return runQpdf(bytes, protectArgs({ ...opts, owner }));
}
