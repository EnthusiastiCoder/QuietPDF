import { test, expect } from './fixtures';
import { ui, openTool, addFiles, runAndDownload, pick, dragOnto } from './ui';
import { TOOLS } from './routes';
import { fixturePath, readFixture } from '../helpers/fixtures';
import { pageCount, pageImages, pageSizes } from '../helpers/pdf';
import { imageDims } from '../helpers/images';

const PHOTOS = ['photo-1.jpg', 'photo-2.png', 'photo-3.webp'] as const;

test.describe('WS2 JPG / images to PDF', () => {
  test('T-IMG1 photo-1.jpg, photo-2.png, photo-3.webp give one 3-page PDF in the given order @smoke', async ({ page, net }) => {
    await openTool(page, TOOLS.jpgToPdf);
    const mark = net.mark();
    await addFiles(page, PHOTOS.map((p) => fixturePath(p)));
    await expect(ui.thumbs(page)).toHaveCount(3);
    const out = await runAndDownload(page);
    expect(await pageCount(out.bytes)).toBe(3);

    // page n holds image n: JPEG kept as DCT, PNG and WebP become Flate (PNG) images
    const expected = PHOTOS.map((p) => imageDims(readFixture(p)));
    const filters = ['DCTDecode', 'FlateDecode', 'FlateDecode'];
    for (let i = 0; i < 3; i++) {
      const imgs = await pageImages(out.bytes, i);
      expect(imgs, `page ${i + 1} has one image`).toHaveLength(1);
      expect(imgs[0].filter).toBe(filters[i]);
      expect({ width: imgs[0].width, height: imgs[0].height }).toEqual(expected[i]);
    }
    expect(net.requestsSince(mark), 'no request after the files were added').toEqual([]);
  });

  test('T-IMG2 an EXIF Orientation=6 photo with "Fit to image" gives a portrait page', async ({ page }) => {
    await openTool(page, TOOLS.jpgToPdf);
    await addFiles(page, [fixturePath('photo-portrait-exif6.jpg')]);
    await pick(page, 'Page size', 'Fit to image');
    const out = await runAndDownload(page);
    const [size] = await pageSizes(out.bytes);
    expect(size.height, `stored pixels are 1200x800 landscape; page is ${size.width}x${size.height}`).toBeGreaterThan(size.width);
    const [img] = await pageImages(out.bytes, 0);
    expect(img.height).toBeGreaterThan(img.width);
  });

  test('T-IMG3 A4 with a Small margin gives a 595x842 pt page with the image inside the margins', async ({ page }) => {
    await openTool(page, TOOLS.jpgToPdf);
    await addFiles(page, [fixturePath('photo-1.jpg')]);
    await pick(page, 'Page size', 'A4');
    await pick(page, 'Margin', 'Small');
    const out = await runAndDownload(page);
    const [size] = await pageSizes(out.bytes);
    expect(Math.abs(size.width - 595)).toBeLessThanOrEqual(1);
    expect(Math.abs(size.height - 842)).toBeLessThanOrEqual(1);
    const [img] = await pageImages(out.bytes, 0);
    expect(img.x).toBeGreaterThan(0);
    expect(img.y).toBeGreaterThan(0);
    expect(img.x + img.width).toBeLessThan(size.width);
    expect(img.y + img.height).toBeLessThan(size.height);
  });

  test('T-IMG4 dragging the 3rd thumbnail to the 1st changes the page order', async ({ page }) => {
    await openTool(page, TOOLS.jpgToPdf);
    await addFiles(page, PHOTOS.map((p) => fixturePath(p)));
    await expect(ui.thumbs(page)).toHaveCount(3);
    await dragOnto(page, ui.thumbs(page).nth(2), ui.thumbs(page).nth(0));
    const out = await runAndDownload(page);

    // new order: webp, jpg, png
    const order = [PHOTOS[2], PHOTOS[0], PHOTOS[1]];
    const filters = ['FlateDecode', 'DCTDecode', 'FlateDecode'];
    for (let i = 0; i < 3; i++) {
      const [img] = await pageImages(out.bytes, i);
      expect(img.filter, `page ${i + 1}`).toBe(filters[i]);
      expect({ width: img.width, height: img.height }).toEqual(imageDims(readFixture(order[i])));
    }
  });
});
