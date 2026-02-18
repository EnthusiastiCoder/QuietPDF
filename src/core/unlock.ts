/**
 * Unlock (decision 13): removes the encryption of a PDF whose password the
 * user knows. A wrong password gives a clear "Incorrect password" error; there
 * is no password cracking.
 */
import { QpdfError, runQpdf } from '../lib/qpdf-setup';
import { closePdf, isPasswordError, openPdf } from '../lib/pdfjs-setup';

export class IncorrectPasswordError extends Error {
  constructor() {
    super('Incorrect password');
    this.name = 'IncorrectPasswordError';
  }
}

/** The qpdf arguments for decryption (exposed for unit tests). */
export function unlockArgs(password: string): string[] {
  return ['--decrypt', `--password=${password}`];
}

/** True when pdf.js rejects the password (qpdf's own message is not always captured). */
async function passwordRejected(bytes: Uint8Array, password: string): Promise<boolean> {
  try {
    closePdf(await openPdf(bytes, { password }));
    return false;
  } catch (e) {
    return isPasswordError(e);
  }
}

export async function unlockPdf(bytes: Uint8Array, password = ''): Promise<Uint8Array> {
  try {
    return await runQpdf(bytes, unlockArgs(password));
  } catch (e) {
    if (e instanceof QpdfError && (/password/i.test(e.output || e.message) || (await passwordRejected(bytes, password)))) {
      throw new IncorrectPasswordError();
    }
    throw e;
  }
}
