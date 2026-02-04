/**
 * Encrypted input (decision 14). A tool calls intakePdf(file); when the PDF
 * needs a password, the shared <PasswordPrompt /> (rendered by the tool) asks
 * for it, the PDF is decrypted in memory with qpdf, and the tool gets the
 * plain bytes. Nothing leaves the browser.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { isPasswordError, openPdf } from './pdfjs-setup';
import { readFile } from './download';
import { QpdfError, runQpdf } from './qpdf-setup';

export const promptState = $state({ open: false, name: '', error: '', busy: false });

let pending: { bytes: Uint8Array; resolve: (b: Uint8Array | null) => void } | null = null;

/** Tries a password; returns the decrypted bytes or an error message. */
async function tryPassword(bytes: Uint8Array, password: string): Promise<Uint8Array | string> {
  try {
    return await runQpdf(bytes, ['--decrypt', `--password=${password}`]);
  } catch (e) {
    if (e instanceof QpdfError && /password/i.test(e.output)) return 'That password is not right. Try again.';
    return 'Could not unlock this PDF.';
  }
}

function askPassword(name: string, bytes: Uint8Array): Promise<Uint8Array | null> {
  promptState.name = name;
  promptState.error = '';
  promptState.busy = false;
  promptState.open = true;
  return new Promise((resolve) => {
    pending = { bytes, resolve };
  });
}

export async function submitPassword(password: string): Promise<void> {
  if (!pending || promptState.busy) return;
  promptState.busy = true;
  const r = await tryPassword(pending.bytes, password);
  promptState.busy = false;
  if (typeof r === 'string') {
    promptState.error = r;
    return;
  }
  promptState.open = false;
  const p = pending;
  pending = null;
  p.resolve(r);
}

export function cancelPassword(): void {
  promptState.open = false;
  const p = pending;
  pending = null;
  p?.resolve(null);
}

export interface PdfIntake {
  bytes: Uint8Array;
  doc: PDFDocumentProxy;
}

/** Reads a PDF file; asks for the password when needed. Null when the user cancels. */
export async function intakePdf(file: File): Promise<PdfIntake | null> {
  const bytes = await readFile(file);
  try {
    return { bytes, doc: await openPdf(bytes) };
  } catch (e) {
    if (!(await isPasswordError(e))) throw e;
  }
  const plain = await askPassword(file.name, bytes);
  if (!plain) return null;
  return { bytes: plain, doc: await openPdf(plain) };
}
