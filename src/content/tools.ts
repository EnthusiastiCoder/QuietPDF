/**
 * The single tool registry (decision 19): one entry per tool, plus the preset
 * and alias routes that open a tool in a given mode. The home grid, the tool
 * routes, the header search and (in WS4) the SEO content all read from here.
 *
 * Order matters: `priority` is the India demand order from the plan (JPG to
 * PDF, PDF to Word, Merge, Compress first).
 */

export type Category = 'popular' | 'organize' | 'convert' | 'edit' | 'security';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'popular', label: 'Popular' },
  { id: 'organize', label: 'Organize' },
  { id: 'convert', label: 'Convert' },
  { id: 'edit', label: 'Edit & Sign' },
  { id: 'security', label: 'Security' },
];

/** What the drop zone accepts. */
export type Accept = 'pdf' | 'image';

/** The client component key (see src/components/tools/index.ts). */
export type ToolComponent =
  | 'images-to-pdf'
  | 'pdf-to-word'
  | 'merge'
  | 'compress'
  | 'split'
  | 'pdf-to-images'
  | 'organize'
  | 'sign'
  | 'protect'
  | 'unlock'
  | 'page-numbers'
  | 'watermark'
  | 'ocr'
  | 'redact'
  | 'pdf-to-text';

export interface Faq {
  q: string;
  a: string;
}

export interface Tool {
  id: ToolComponent;
  /** Route without the leading slash, e.g. "merge-pdf". */
  slug: string;
  /** Card and nav name. */
  name: string;
  /** The page H1. */
  h1: string;
  /** One-line card text; also the default meta description. */
  summary: string;
  /** <title>; WS4 refines it. */
  title: string;
  /** Meta description; WS4 refines it. */
  description: string;
  category: Category;
  /** 1 = most demanded. */
  priority: number;
  accept: Accept;
  multiple: boolean;
  /** Short glyph shown on the card (decorative). */
  icon: string;
  /** Words the header search also matches. */
  keywords: string[];
  howTo: string[];
  faqs: Faq[];
}

const t = (x: Omit<Tool, 'title' | 'description' | 'howTo' | 'faqs'> & Partial<Pick<Tool, 'title' | 'description' | 'howTo' | 'faqs'>>): Tool => ({
  title: `${x.h1} - free, private, in your browser | QuietPDF`,
  description: `${x.summary} Runs entirely in your browser: no upload, no signup, no limits.`,
  howTo: [],
  faqs: [],
  ...x,
});

export const TOOLS: Tool[] = [
  t({
    id: 'images-to-pdf',
    slug: 'jpg-to-pdf',
    name: 'JPG to PDF',
    h1: 'JPG to PDF',
    summary: 'Turn JPG, PNG, WebP or GIF images into one PDF, in the order you choose.',
    category: 'popular',
    priority: 1,
    accept: 'image',
    multiple: true,
    icon: 'IMG',
    keywords: ['image to pdf', 'png to pdf', 'photo to pdf', 'jpeg'],
  }),
  t({
    id: 'pdf-to-word',
    slug: 'pdf-to-word',
    name: 'PDF to Word',
    h1: 'PDF to Word',
    summary: 'Convert a PDF to an editable DOCX with headings, paragraphs and images kept.',
    category: 'popular',
    priority: 2,
    accept: 'pdf',
    multiple: false,
    icon: 'DOC',
    keywords: ['docx', 'word', 'convert'],
  }),
  t({
    id: 'merge',
    slug: 'merge-pdf',
    name: 'Merge PDF',
    h1: 'Merge PDF',
    summary: 'Combine several PDFs into one file, in any order.',
    category: 'popular',
    priority: 3,
    accept: 'pdf',
    multiple: true,
    icon: 'MRG',
    keywords: ['combine', 'join'],
  }),
  t({
    id: 'compress',
    slug: 'compress-pdf',
    name: 'Compress PDF',
    h1: 'Compress PDF',
    summary: 'Make a PDF smaller by recompressing its images, with three quality levels.',
    category: 'popular',
    priority: 4,
    accept: 'pdf',
    multiple: false,
    icon: 'CMP',
    keywords: ['reduce size', 'shrink', 'optimise', 'optimize'],
  }),
  t({
    id: 'split',
    slug: 'split-pdf',
    name: 'Split PDF',
    h1: 'Split PDF',
    summary: 'Split a PDF by page ranges, every N pages, or into single pages.',
    category: 'organize',
    priority: 5,
    accept: 'pdf',
    multiple: false,
    icon: 'SPL',
    keywords: ['separate', 'extract', 'divide'],
  }),
  t({
    id: 'pdf-to-images',
    slug: 'pdf-to-jpg',
    name: 'PDF to JPG',
    h1: 'PDF to JPG',
    summary: 'Save every PDF page as a JPG or PNG image.',
    category: 'convert',
    priority: 6,
    accept: 'pdf',
    multiple: false,
    icon: 'JPG',
    keywords: ['pdf to png', 'pdf to image', 'export pages'],
  }),
  t({
    id: 'organize',
    slug: 'organize-pdf',
    name: 'Organize PDF',
    h1: 'Organize PDF pages',
    summary: 'Rotate, delete, reorder, duplicate or insert pages visually.',
    category: 'organize',
    priority: 7,
    accept: 'pdf',
    multiple: false,
    icon: 'ORG',
    keywords: ['rotate', 'delete pages', 'reorder', 'sort'],
  }),
  t({
    id: 'sign',
    slug: 'sign-pdf',
    name: 'Sign PDF',
    h1: 'Sign PDF',
    summary: 'Draw, type or upload your signature and place it on any page.',
    category: 'edit',
    priority: 8,
    accept: 'pdf',
    multiple: false,
    icon: 'SGN',
    keywords: ['signature', 'e-sign', 'fill and sign'],
  }),
  t({
    id: 'protect',
    slug: 'protect-pdf',
    name: 'Protect PDF',
    h1: 'Protect PDF with a password',
    summary: 'Encrypt a PDF with AES-256 and an open password.',
    category: 'security',
    priority: 9,
    accept: 'pdf',
    multiple: false,
    icon: 'LCK',
    keywords: ['encrypt', 'password', 'lock'],
  }),
  t({
    id: 'unlock',
    slug: 'unlock-pdf',
    name: 'Unlock PDF',
    h1: 'Unlock PDF',
    summary: 'Remove the password from a PDF you can open.',
    category: 'security',
    priority: 10,
    accept: 'pdf',
    multiple: false,
    icon: 'ULK',
    keywords: ['decrypt', 'remove password'],
  }),
  t({
    id: 'page-numbers',
    slug: 'add-page-numbers',
    name: 'Page numbers',
    h1: 'Add page numbers to PDF',
    summary: 'Number pages in six positions and four formats.',
    category: 'edit',
    priority: 11,
    accept: 'pdf',
    multiple: false,
    icon: '123',
    keywords: ['numbering', 'paginate'],
  }),
  t({
    id: 'watermark',
    slug: 'add-watermark',
    name: 'Watermark',
    h1: 'Add a watermark to PDF',
    summary: 'Stamp text or an image over or behind your pages.',
    category: 'edit',
    priority: 12,
    accept: 'pdf',
    multiple: false,
    icon: 'WMK',
    keywords: ['stamp', 'confidential', 'logo'],
  }),
  t({
    id: 'ocr',
    slug: 'ocr-pdf',
    name: 'OCR PDF',
    h1: 'OCR PDF',
    summary: 'Make scanned PDFs searchable in English and Hindi.',
    category: 'convert',
    priority: 13,
    accept: 'pdf',
    multiple: false,
    icon: 'OCR',
    keywords: ['scan', 'searchable', 'text recognition', 'hindi'],
  }),
  t({
    id: 'redact',
    slug: 'redact-pdf',
    name: 'Redact PDF',
    h1: 'Redact PDF',
    summary: 'Permanently remove text and areas: the hidden content is gone, not covered.',
    category: 'security',
    priority: 14,
    accept: 'pdf',
    multiple: false,
    icon: 'RED',
    keywords: ['black out', 'censor', 'remove text'],
  }),
  t({
    id: 'pdf-to-text',
    slug: 'pdf-to-text',
    name: 'PDF to Text',
    h1: 'PDF to Text',
    summary: 'Extract the text of a PDF as a plain .txt file, in reading order.',
    category: 'convert',
    priority: 15,
    accept: 'pdf',
    multiple: false,
    icon: 'TXT',
    keywords: ['extract text', 'txt'],
  }),
];

/** A route that opens a tool in a preset mode (Organize presets) or under a search alias. */
export interface ToolRoute {
  slug: string;
  tool: ToolComponent;
  /** Preset passed to the tool component (e.g. "rotate", "png"). */
  preset?: string;
  /** H1 for the route. */
  h1: string;
  summary: string;
  /** The route this one canonicalises to (aliases only; presets are their own landing pages). */
  canonical?: string;
}

export const PRESET_ROUTES: ToolRoute[] = [
  { slug: 'rotate-pdf', tool: 'organize', preset: 'rotate', h1: 'Rotate PDF', summary: 'Rotate one page or all pages of a PDF.' },
  { slug: 'delete-pdf-pages', tool: 'organize', preset: 'delete', h1: 'Delete PDF pages', summary: 'Remove the pages you do not need.' },
  { slug: 'reorder-pdf-pages', tool: 'organize', preset: 'reorder', h1: 'Reorder PDF pages', summary: 'Drag pages into a new order.' },
  { slug: 'extract-pdf-pages', tool: 'organize', preset: 'extract', h1: 'Extract PDF pages', summary: 'Save selected pages as a new PDF.' },
];

export const ALIAS_ROUTES: ToolRoute[] = [
  { slug: 'image-to-pdf', tool: 'images-to-pdf', preset: 'image', h1: 'Image to PDF', summary: 'Turn images into one PDF.', canonical: 'jpg-to-pdf' },
  { slug: 'png-to-pdf', tool: 'images-to-pdf', preset: 'png', h1: 'PNG to PDF', summary: 'Turn PNG images into one PDF.', canonical: 'jpg-to-pdf' },
  { slug: 'pdf-to-png', tool: 'pdf-to-images', preset: 'png', h1: 'PDF to PNG', summary: 'Save every PDF page as a PNG image.', canonical: 'pdf-to-jpg' },
];

export function toolsInDemandOrder(): Tool[] {
  return [...TOOLS].sort((a, b) => a.priority - b.priority);
}

export function toolById(id: ToolComponent): Tool {
  const tool = TOOLS.find((x) => x.id === id);
  if (!tool) throw new Error(`unknown tool ${id}`);
  return tool;
}

export function toolBySlug(slug: string): Tool | undefined {
  return TOOLS.find((x) => x.slug === slug);
}

/** Every route that renders a tool: the 15 tools, the presets and the aliases. */
export function allToolRoutes(): ToolRoute[] {
  return [
    ...TOOLS.map((x) => ({ slug: x.slug, tool: x.id, h1: x.h1, summary: x.summary })),
    ...PRESET_ROUTES,
    ...ALIAS_ROUTES,
  ];
}
