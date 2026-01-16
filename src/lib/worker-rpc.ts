/**
 * A small typed RPC layer over module Web Workers.
 *
 * Main thread:
 *   const w = createWorkerClient<Api>(() => new Worker(new URL('../workers/x.worker.ts', import.meta.url), { type: 'module' }));
 *   const out = await w.call('run', [bytes, opts], { signal, onProgress, transfer: [bytes.buffer] });
 * Worker:
 *   expose<Api>({ async run(bytes, opts, ctx) { ctx.progress(1, 3); ...; return transfer(result, [result.buffer]); } });
 *
 * Every call has a request id; progress events stream back; an AbortSignal
 * cancels the call (the worker handler sees ctx.signal aborted and the caller
 * gets an AbortError); arguments and results can be transferred.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
export type Api = Record<string, AnyFn>;

export interface WorkerContext {
  progress(done: number, total: number, label?: string): void;
  signal: AbortSignal;
}

/** Handler signature on the worker side: the API args plus a context. */
export type Handlers<A extends Api> = {
  [K in keyof A]: (
    ...args: [...Parameters<A[K]>, WorkerContext]
  ) => Awaited<ReturnType<A[K]>> | Transferring<Awaited<ReturnType<A[K]>>> | Promise<Awaited<ReturnType<A[K]>> | Transferring<Awaited<ReturnType<A[K]>>>>;
};

export interface Progress {
  done: number;
  total: number;
  label?: string;
}

export interface CallOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  transfer?: Transferable[];
}

type ToWorker = { id: number; type: 'call'; method: string; args: unknown[] } | { id: number; type: 'cancel' };

type FromWorker =
  | { id: number; type: 'progress'; done: number; total: number; label?: string }
  | { id: number; type: 'result'; value: unknown }
  | { id: number; type: 'error'; name: string; message: string };

const TRANSFER = '__qpTransfer';
export interface Transferring<T> {
  [TRANSFER]: true;
  value: T;
  transfer: Transferable[];
}

/** Marks a worker result to be sent with transferables instead of being copied. */
export function transfer<T>(value: T, list: Transferable[]): Transferring<T> {
  return { [TRANSFER]: true, value, transfer: list };
}

export class RpcError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export function abortError(): DOMException {
  return new DOMException('The operation was cancelled.', 'AbortError');
}

export function isAbortError(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError';
}

export interface WorkerClient<A extends Api> {
  call<K extends keyof A & string>(method: K, args: Parameters<A[K]>, opts?: CallOptions): Promise<Awaited<ReturnType<A[K]>>>;
  /** Starts the worker now (warm-up), so later calls make no network request. */
  warm(): void;
  terminate(): void;
}

export function createWorkerClient<A extends Api>(factory: () => Worker): WorkerClient<A> {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: unknown): void; onProgress?: (p: Progress) => void }>();

  const ensure = (): Worker => {
    if (worker) return worker;
    const w = factory();
    w.onmessage = (ev: MessageEvent<FromWorker>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'progress') {
        p.onProgress?.({ done: msg.done, total: msg.total, label: msg.label });
      } else if (msg.type === 'result') {
        pending.delete(msg.id);
        p.resolve(msg.value);
      } else {
        pending.delete(msg.id);
        p.reject(msg.name === 'AbortError' ? abortError() : new RpcError(msg.name, msg.message));
      }
    };
    w.onerror = (ev) => {
      const err = new RpcError('WorkerError', ev.message || 'The worker crashed.');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      w.terminate();
      worker = null;
    };
    worker = w;
    return w;
  };

  return {
    call(method, args, opts = {}) {
      const { signal, onProgress, transfer: list = [] } = opts;
      if (signal?.aborted) return Promise.reject(abortError());
      const w = ensure();
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const onAbort = () => {
          if (!pending.has(id)) return;
          pending.delete(id);
          w.postMessage({ id, type: 'cancel' } satisfies ToWorker);
          reject(abortError());
        };
        pending.set(id, {
          resolve: (v) => {
            signal?.removeEventListener('abort', onAbort);
            resolve(v as never);
          },
          reject: (e) => {
            signal?.removeEventListener('abort', onAbort);
            reject(e);
          },
          onProgress,
        });
        signal?.addEventListener('abort', onAbort, { once: true });
        w.postMessage({ id, type: 'call', method, args } satisfies ToWorker, list);
      });
    },
    warm() {
      ensure();
    },
    terminate() {
      worker?.terminate();
      worker = null;
      for (const p of pending.values()) p.reject(abortError());
      pending.clear();
    },
  };
}

/** Worker side: serves the handlers. Call once at the top level of a worker module. */
export function expose<A extends Api>(handlers: Handlers<A>): void {
  const scope = self as unknown as {
    postMessage(msg: FromWorker, transfer?: Transferable[]): void;
    onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
  };
  const controllers = new Map<number, AbortController>();
  scope.onmessage = async (ev) => {
    const msg = ev.data;
    if (msg.type === 'cancel') {
      controllers.get(msg.id)?.abort();
      controllers.delete(msg.id);
      return;
    }
    const ctrl = new AbortController();
    controllers.set(msg.id, ctrl);
    const ctx: WorkerContext = {
      signal: ctrl.signal,
      progress: (done, total, label) => scope.postMessage({ id: msg.id, type: 'progress', done, total, label }),
    };
    try {
      const fn = handlers[msg.method as keyof A] as AnyFn | undefined;
      if (!fn) throw new RpcError('NotFound', `Unknown worker method: ${msg.method}`);
      const out = await fn(...msg.args, ctx);
      if (ctrl.signal.aborted) return;
      if (out && typeof out === 'object' && TRANSFER in out) {
        const t = out as Transferring<unknown>;
        scope.postMessage({ id: msg.id, type: 'result', value: t.value }, t.transfer);
      } else {
        scope.postMessage({ id: msg.id, type: 'result', value: out });
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = e instanceof Error ? e : new Error(String(e));
      scope.postMessage({ id: msg.id, type: 'error', name: err.name, message: err.message });
    } finally {
      controllers.delete(msg.id);
    }
  };
}

/** Throws an AbortError if the signal is aborted (call between steps in long handlers). */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}
