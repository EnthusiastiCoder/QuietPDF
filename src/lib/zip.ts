import { unzipSync, zip as fflateZip, type Zippable } from 'fflate';

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Builds a ZIP archive. PDFs, JPEGs and PNGs are already compressed, so they are
 * stored (level 0); everything else is deflated. Duplicate names get a suffix.
 */
export function zip(entries: ZipEntry[]): Promise<Uint8Array> {
  const files: Zippable = {};
  for (const e of entries) {
    const name = uniqueName(files, e.name);
    const stored = /\.(pdf|jpe?g|png|webp|gif|zip|docx)$/i.test(name);
    files[name] = [e.data, { level: stored ? 0 : 6 }];
  }
  return new Promise((resolve, reject) => {
    fflateZip(files, { mtime: new Date('2026-01-01T00:00:00Z') }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

export function unzip(archive: Uint8Array): ZipEntry[] {
  return Object.entries(unzipSync(archive)).map(([name, data]) => ({ name, data }));
}

function uniqueName(files: Zippable, name: string): string {
  if (!(name in files)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!(candidate in files)) return candidate;
  }
}
