import qrcode from 'qrcode-generator';

// The @types/qrcode-generator definitions omit these runtime methods.
interface QrModel {
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}

/**
 * Render the given text as a QR code and return a PNG data URL.
 * Drawn straight to a canvas (white background, black modules) so the result
 * is a crisp raster image suitable for printing or embedding.
 */
export function qrPngDataUrl(text: string, pixelSize = 600, marginModules = 4): string {
  const qr = qrcode(0, 'M'); // type 0 = auto-size, error correction level M
  qr.addData(text);
  qr.make();

  const model = qr as unknown as QrModel;
  const count = model.getModuleCount();
  const totalModules = count + marginModules * 2;
  const cell = Math.max(1, Math.floor(pixelSize / totalModules));
  const dim = cell * totalModules;

  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (model.isDark(row, col)) {
        ctx.fillRect((col + marginModules) * cell, (row + marginModules) * cell, cell, cell);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

/** Trigger a browser download of a data URL under the given filename. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Make a filesystem-safe slug from arbitrary text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
