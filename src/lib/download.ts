/** Download and file helpers. Everything stays in memory: nothing is uploaded. */

export const MIME = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain;charset=utf-8',
  jpg: 'image/jpeg',
  png: 'image/png',
} as const;

export function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (MIME as Record<string, string>)[ext === 'jpeg' ? 'jpg' : ext] ?? 'application/octet-stream';
}

export function toBlob(bytes: Uint8Array, name: string): Blob {
  return new Blob([bytes as BlobPart], { type: mimeFor(name) });
}

/** Triggers a browser download of the bytes under the given name. */
export function downloadBytes(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(toBlob(bytes, name));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function readFile(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** "report.pdf" -> "report" */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** ("report.pdf", "compressed") -> "report-compressed.pdf" */
export function suffixed(name: string, suffix: string, ext?: string): string {
  const e = ext ?? (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'pdf');
  return `${baseName(name)}-${suffix}.${e}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  return /^image\/(jpeg|png|webp|gif)$/.test(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

/** True when the bytes contain the PDF header within the first 1 KB (as readers allow). */
export function hasPdfHeader(bytes: Uint8Array): boolean {
  let head = '';
  const n = Math.min(bytes.length, 1024);
  for (let i = 0; i < n; i++) head += String.fromCharCode(bytes[i]);
  return head.includes('%PDF-');
}
