// Texpile: reads the strokes of a Box's svgOverlay (the cancel lines, an arrow head, a long division sign) for the canvas
export type SvgOverlayShape =
  | { tag: 'line'; x1: string; y1: string; x2: string; y2: string }
  | { tag: 'polygon'; points: string }
  | { tag: 'path'; d: string };

export type SvgOverlayPiece = {
  shape: SvgOverlayShape;
  attributes: Record<string, string>;
};

function attributesOf(markup: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of markup.matchAll(/([a-z0-9-]+)=(?:"([^"]*)"|'([^']*)')/g))
    attributes[match[1]] = match[2] ?? match[3];
  return attributes;
}

/** the shapes of an overlay, each with its own attributes laid over the ones the svg element sets for all */
export function svgOverlayPieces(
  overlay: string,
  svgStyle: string | undefined
): SvgOverlayPiece[] {
  const inherited = attributesOf(svgStyle ?? '');
  const pieces: SvgOverlayPiece[] = [];
  for (const match of overlay.matchAll(/<(line|polygon|path)\b([^>]*?)\/?>/g)) {
    const own = attributesOf(match[2]);
    const attributes = { ...inherited, ...own };
    if (match[1] === 'line')
      pieces.push({
        shape: {
          tag: 'line',
          x1: own.x1 ?? '0',
          y1: own.y1 ?? '0',
          x2: own.x2 ?? '0',
          y2: own.y2 ?? '0',
        },
        attributes,
      });
    else if (match[1] === 'polygon')
      pieces.push({
        shape: { tag: 'polygon', points: own.points ?? '' },
        attributes,
      });
    else pieces.push({ shape: { tag: 'path', d: own.d ?? '' }, attributes });
  }
  return pieces;
}
