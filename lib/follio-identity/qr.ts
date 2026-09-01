import QRCode from 'qrcode';

/**
 * Render a Follio URL as an inline SVG QR code.
 *
 * Generated on the server so the share sheet needs no client-side library and
 * no third-party image host — the URL never leaves our infrastructure.
 */

export type RenderQrSvgOptions = {
  /** Quiet zone in modules. Scanners need at least 2 to lock on reliably. */
  margin?: number;
};

/** Squares are merged into horizontal runs so the path stays small. */
function modulePaths(data: Uint8Array, size: number, margin: number): string {
  const runs: string[] = [];

  for (let y = 0; y < size; y += 1) {
    let start = -1;
    for (let x = 0; x <= size; x += 1) {
      const filled = x < size && data[y * size + x] === 1;
      if (filled && start < 0) start = x;
      if (!filled && start >= 0) {
        const width = x - start;
        runs.push(`M${start + margin} ${y + margin}h${width}v1h-${width}z`);
        start = -1;
      }
    }
  }

  return runs.join('');
}

export function renderQrSvg(text: string, options: RenderQrSvgOptions = {}): string {
  const margin = options.margin ?? 2;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const extent = size + margin * 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}"`,
    ' width="100%" height="100%" shape-rendering="crispEdges" role="img">',
    `<rect width="${extent}" height="${extent}" fill="#ffffff"/>`,
    `<path fill="#000000" d="${modulePaths(qr.modules.data, size, margin)}"/>`,
    '</svg>',
  ].join('');
}
