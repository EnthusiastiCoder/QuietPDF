/**
 * Lazy map from a tool component key (src/content/tools.ts) to its Svelte
 * component. Each tool is its own chunk, so a tool page only downloads the
 * code it needs. Tools not built yet fall back to Placeholder.
 */
import type { Component } from 'svelte';
import type { Accept, ToolComponent } from '../../content/tools';

export interface ToolProps {
  /** Preset mode from the route (organize presets, alias variants). */
  preset?: string;
  accept: Accept;
  multiple: boolean;
}

type Loader = () => Promise<{ default: Component<ToolProps> }>;

const placeholder: Loader = () => import('./Placeholder.svelte');

export const TOOL_LOADERS: Record<ToolComponent, Loader> = {
  'images-to-pdf': () => import('./ImagesToPdf.svelte'),
  'pdf-to-word': () => import('./PdfToWord.svelte'),
  merge: () => import('./Merge.svelte'),
  compress: () => import('./Compress.svelte'),
  split: () => import('./Split.svelte'),
  'pdf-to-images': () => import('./PdfToImages.svelte'),
  organize: () => import('./Organize.svelte'),
  sign: () => import('./Sign.svelte'),
  protect: () => import('./Protect.svelte'),
  unlock: () => import('./Unlock.svelte'),
  'page-numbers': () => import('./PageNumbers.svelte'),
  watermark: () => import('./Watermark.svelte'),
  ocr: () => import('./Ocr.svelte'),
  redact: placeholder,
  'pdf-to-text': () => import('./PdfToText.svelte'),
};

export function loadTool(id: ToolComponent): Promise<{ default: Component<ToolProps> }> {
  return (TOOL_LOADERS[id] ?? placeholder)();
}
