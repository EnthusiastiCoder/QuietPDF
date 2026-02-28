/**
 * Landing-page content per tool (WS4): how-to steps, FAQs and the "why private"
 * line. Kept apart from the registry so each tool's copy is its own hunk.
 */
import type { Faq, ToolComponent } from './tools';

export interface Landing {
  howTo: string[];
  faqs: Faq[];
}

const f = (q: string, a: string): Faq => ({ q, a });

export const LANDING: Record<ToolComponent, Landing> = {
  'images-to-pdf': {
    howTo: ['Add your JPG, PNG, WebP or GIF images.', 'Drag the thumbnails into the order you want.', 'Choose page size and margins, press Convert and download the PDF.'],
    faqs: [
      f('Does JPG to PDF upload my photos?', 'No. The conversion runs in your browser and no request carries your images.'),
      f('Which image formats work?', 'JPG, PNG, WebP and GIF.'),
      f('Is there a limit on the number of images?', 'QuietPDF sets none. Only your device memory limits very large batches.'),
      f('Can I reorder images before converting?', 'Yes, drag the thumbnails into any order.'),
      f('Does it work offline?', 'Yes. Once the page has loaded the tool keeps working without a connection.'),
    ],
  },
  'pdf-to-word': {
    howTo: ['Add the PDF you want to convert.', 'Press Convert to Word.', 'Download the DOCX and open it in Word, LibreOffice or Google Docs.'],
    faqs: [
      f('Is my PDF uploaded to convert it?', 'No. The DOCX is built in your browser from the text and images of your PDF.'),
      f('Will the layout match exactly?', 'Headings, paragraphs and images are kept, but complex layouts such as multi-column pages may differ.'),
      f('Can it convert a scanned PDF?', 'Run the OCR tool first so the pages contain text, then convert.'),
      f('Is it free with no limits?', 'Yes, there is no signup, watermark or page cap.'),
    ],
  },
  merge: {
    howTo: ['Add two or more PDFs.', 'Drag the files into the order you want.', 'Press Merge and download the combined PDF.'],
    faqs: [
      f('Are my PDFs uploaded when I merge them?', 'No. Merging happens in your browser and nothing leaves your device.'),
      f('How many PDFs can I merge?', 'There is no fixed limit. Very large files depend on your device memory.'),
      f('Can I change the order?', 'Yes, drag the files into any order before merging.'),
      f('Are bookmarks and forms kept?', 'Pages are copied as they are. Document-level extras such as bookmarks may not carry over.'),
    ],
  },
  compress: {
    howTo: ['Add the PDF.', 'Choose a quality level: low, medium or high compression.', 'Press Compress and compare the sizes before you download.'],
    faqs: [
      f('Is my PDF uploaded to compress it?', 'No. Images are recompressed in your browser and the file never leaves your device.'),
      f('How much smaller will it get?', 'It depends on the images in the file. Text-only PDFs shrink little; scans and photos shrink a lot.'),
      f('Will quality drop?', 'Higher compression lowers image quality. You see the new size first and can pick another level.'),
      f('Is there a file size limit?', 'None is imposed. Very large files depend on your device memory.'),
    ],
  },
  split: {
    howTo: ['Add the PDF.', 'Choose page ranges, every N pages, or single pages.', 'Press Split and download the parts, as a ZIP when there are several.'],
    faqs: [
      f('Is my PDF uploaded to split it?', 'No. Splitting runs in your browser.'),
      f('Can I split by page range?', 'Yes, for example 1-3, 7, 9-12.'),
      f('Can I split into one file per page?', 'Yes, choose single pages.'),
      f('Do I get one download or many?', 'Several parts are bundled into one ZIP.'),
    ],
  },
  'pdf-to-images': {
    howTo: ['Add the PDF.', 'Choose JPG or PNG and the resolution.', 'Press Convert and download the images, as a ZIP for several pages.'],
    faqs: [
      f('Are my pages uploaded to be converted?', 'No. Pages are rendered in your browser.'),
      f('Which formats can I save?', 'JPG and PNG.'),
      f('Can I convert only some pages?', 'Yes, pick the pages before converting.'),
      f('What resolution do I get?', 'You choose the scale. Higher scales give sharper but larger images.'),
    ],
  },
  organize: {
    howTo: ['Add the PDF and wait for the page thumbnails.', 'Rotate, reorder or delete pages.', 'Press Save and download the new PDF.'],
    faqs: [
      f('Is my PDF uploaded when I reorganise it?', 'No. Everything happens in your browser.'),
      f('Can I rotate a single page?', 'Yes, rotate any page or all of them.'),
      f('Can I delete pages?', 'Yes, mark pages and remove them.'),
      f('Can I extract some pages as a new PDF?', 'Yes, select the pages and save only those.'),
    ],
  },
  sign: {
    howTo: ['Add the PDF.', 'Draw, type or upload your signature and place it on the page.', 'Press Save and download the signed PDF.'],
    faqs: [
      f('Is my signature or PDF uploaded?', 'No. Both stay in your browser.'),
      f('Is this a legally binding digital signature?', 'It places an image of your signature on the page. It is not a certificate-based digital signature.'),
      f('Can I type my signature?', 'Yes. You can draw, type or upload an image.'),
      f('Can I sign several pages?', 'Yes, place the signature on each page you need.'),
    ],
  },
  protect: {
    howTo: ['Add the PDF.', 'Enter a password and confirm it.', 'Press Protect and download the encrypted PDF.'],
    faqs: [
      f('Is my password sent anywhere?', 'No. The PDF is encrypted in your browser and the password never leaves your device.'),
      f('What encryption is used?', 'AES-256, through the open-source qpdf engine.'),
      f('Can I recover a forgotten password?', 'No. Keep the password safe, because QuietPDF cannot recover it.'),
      f('Will it open in any PDF reader?', 'Standard readers ask for the password before showing the pages.'),
    ],
  },
  unlock: {
    howTo: ['Add the protected PDF.', 'Enter its password if one is needed to open it.', 'Press Unlock and download the PDF without a password.'],
    faqs: [
      f('Is my PDF uploaded to unlock it?', 'No. Unlocking runs in your browser.'),
      f('Can it remove a password I do not know?', 'No. You must supply the password. QuietPDF does not crack passwords.'),
      f('What does it remove?', 'It removes the password protection from a file you can open.'),
      f('Is it free with no limits?', 'Yes, with no signup.'),
    ],
  },
  'page-numbers': {
    howTo: ['Add the PDF.', 'Choose position, format and starting number.', 'Press Apply and download the numbered PDF.'],
    faqs: [
      f('Is my PDF uploaded to add numbers?', 'No. The numbers are drawn in your browser.'),
      f('Can I choose where the numbers go?', 'Yes, pick the position on the page.'),
      f('Can I start from a different number?', 'Yes, set the first number.'),
      f('Can I number only some pages?', 'Yes, pick the page range.'),
    ],
  },
  watermark: {
    howTo: ['Add the PDF.', 'Type the watermark text and set size, opacity and angle.', 'Press Apply and download the watermarked PDF.'],
    faqs: [
      f('Is my PDF uploaded to add a watermark?', 'No. It is stamped in your browser.'),
      f('Can I control how visible it is?', 'Yes, set the opacity, size and angle.'),
      f('Does it go on every page?', 'Yes, on all pages or on a range you choose.'),
      f('Can the watermark be removed later?', 'It is drawn into the pages, so removing it needs the original file.'),
    ],
  },
  ocr: {
    howTo: ['Add the scanned PDF.', 'Choose the language: English or Hindi.', 'Press Run OCR and download a searchable PDF or the text.'],
    faqs: [
      f('Is my scan uploaded for OCR?', 'No. The OCR engine and language data load from this site and run in your browser.'),
      f('Which languages are supported?', 'English and Hindi.'),
      f('Will the PDF look the same?', 'Yes. The page images stay and an invisible text layer is added.'),
      f('Why can OCR be slow?', 'It runs on your device, so speed depends on your processor and the page count.'),
    ],
  },
  redact: {
    howTo: ['Add the PDF.', 'Draw boxes over the text or images to remove.', 'Press Redact and download a PDF where the content is truly gone.'],
    faqs: [
      f('Is the hidden text really removed?', 'Yes. The page is rebuilt without the covered content, not just painted over.'),
      f('Is my PDF uploaded for redaction?', 'No. Redaction runs in your browser.'),
      f('Can I undo a redaction after saving?', 'No. Keep the original file if you may need it.'),
      f('Can I redact images too?', 'Yes, anything under the boxes is removed.'),
    ],
  },
  'pdf-to-text': {
    howTo: ['Add the PDF.', 'Press Extract text.', 'Copy the text or download it as a .txt file.'],
    faqs: [
      f('Is my PDF uploaded to extract text?', 'No. The text is read in your browser.'),
      f('Does it work on scanned PDFs?', 'Scans have no text layer, so run OCR first.'),
      f('Is formatting kept?', 'You get plain text, page by page, without styling.'),
      f('Is there a size limit?', 'None is imposed. Very large files depend on device memory.'),
    ],
  },
};
