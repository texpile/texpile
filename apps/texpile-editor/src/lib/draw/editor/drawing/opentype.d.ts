// opentype.js 2.x ships no types; the editor only reads glyph paths
declare module 'opentype.js' {
	export type Glyph = { getPath(x: number, y: number, size: number): { toPathData(decimals?: number): string } };
	export type Font = { charToGlyph(ch: string): Glyph; glyphs: { get(index: number): Glyph } };
	export function parse(buffer: ArrayBuffer): Font;
}
