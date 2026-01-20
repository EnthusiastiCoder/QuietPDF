/**
 * The in-page privacy proof (decision 4).
 *
 * Sources:
 *  - PerformanceObserver('resource', buffered) for every request the page made,
 *    plus the navigation entry for the page itself;
 *  - messages from the service worker's fetch handler for requests made by
 *    workers (they are not in the page's performance timeline);
 *  - a wrapper around fetch / XMLHttpRequest / sendBeacon that adds up any
 *    request body bytes, so "Files uploaded" is measured, not asserted.
 */

export interface MeterEntry {
  url: string;
  origin: string;
  /** Transfer size in bytes when known (0 for cache hits or opaque entries). */
  size: number;
  /** ms since navigation start */
  time: number;
  thirdParty: boolean;
  via: 'page' | 'worker';
}

export interface MeterState {
  entries: MeterEntry[];
  thirdParty: number;
  uploadedBytes: number;
  /** Requests since the first file was added; null until a file is added. */
  sinceFile: number | null;
}

type Listener = (s: MeterState) => void;

const listeners = new Set<Listener>();
const entries: MeterEntry[] = [];
let uploadedBytes = 0;
let fileMark: number | null = null;
let started = false;

function snapshot(): MeterState {
  return {
    entries: [...entries],
    thirdParty: entries.filter((e) => e.thirdParty).length,
    uploadedBytes,
    sinceFile: fileMark === null ? null : entries.length - fileMark,
  };
}

function emit(): void {
  const s = snapshot();
  for (const l of listeners) l(s);
}

const LOCAL = /^(data|blob|about|chrome-extension|moz-extension|safari-web-extension):/i;

function add(url: string, size: number, time: number, via: MeterEntry['via']): void {
  if (LOCAL.test(url)) return;
  let origin = '';
  try {
    origin = new URL(url, location.href).origin;
  } catch {
    origin = url;
  }
  entries.push({ url, origin, size, time, thirdParty: origin !== location.origin, via });
}

function bodySize(body: unknown): number {
  if (body == null) return 0;
  if (typeof body === 'string') return new TextEncoder().encode(body).length;
  if (body instanceof Blob) return body.size;
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  if (body instanceof URLSearchParams) return body.toString().length;
  if (body instanceof FormData) {
    let n = 0;
    for (const [, v] of body) n += typeof v === 'string' ? v.length : v.size;
    return n;
  }
  return 0;
}

function countUpload(n: number): void {
  if (n > 0) {
    uploadedBytes += n;
    emit();
  }
}

function wrapSenders(): void {
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    countUpload(bodySize(init?.body));
    return origFetch(input, init);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    countUpload(bodySize(body));
    return origSend.call(this, body);
  };
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      countUpload(bodySize(data));
      return origBeacon(url, data);
    };
  }
}

/** Starts observing (idempotent). Call as early as possible on every page. */
export function startMeter(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  add(nav?.name ?? location.href, nav?.transferSize ?? 0, 0, 'page');

  if ('PerformanceObserver' in window) {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) add(e.name, e.transferSize ?? 0, e.startTime, 'page');
      emit();
    });
    try {
      po.observe({ type: 'resource', buffered: true });
    } catch {
      po.observe({ entryTypes: ['resource'] });
    }
  }

  navigator.serviceWorker?.addEventListener('message', (ev: MessageEvent) => {
    const d = ev.data as { type?: string; url?: string; fromWorker?: boolean } | null;
    if (d?.type === 'qp-fetch' && d.url && d.fromWorker) {
      add(d.url, 0, performance.now(), 'worker');
      emit();
    }
  });

  wrapSenders();
  emit();
}

/** Marks the moment the user added a file: the meter then counts requests since. */
export function markFileAdded(): void {
  if (fileMark === null) {
    fileMark = entries.length;
    emit();
  }
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(snapshot());
  return () => listeners.delete(fn);
}
