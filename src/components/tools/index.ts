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
  'images-to-pdf': placeholder,
  'pdf-to-word': placeholder,
  merge: () => import('./Merge.svelte'),
  compress: placeholder,
  split: placeholder,
  'pdf-to-images': placeholder,
  organize: placeholder,
  sign: placeholder,
  protect: placeholder,
  unlock: placeholder,
  'page-numbers': placeholder,
  watermark: placeholder,
  ocr: placeholder,
  redact: placeholder,
  'pdf-to-text': placeholder,
};

export function loadTool(id: ToolComponent): Promise<{ default: Component<ToolProps> }> {
  return (TOOL_LOADERS[id] ?? placeholder)();
}
