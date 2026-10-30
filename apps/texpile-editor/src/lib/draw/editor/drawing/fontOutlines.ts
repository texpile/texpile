// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- the app's check reads this file without the editor's tsconfig
/// <reference path="./opentype.d.ts" />
import * as opentype from 'opentype.js';
import type { EngineFont } from '../provider/figureEngine';
import { parseT1, type T1Font } from '$lib/draft/type1/t1font';
import { BP_PER_PT } from '../figure/lengthUnits';
import { sfntFromTtc } from './ttc';

/** the host's way to a font file's bytes, by the path the engine reported */
export type FontFileReader = (path: string) => Promise<ArrayBuffer>;

type ParsedFont = { ot?: opentype.Font; t1?: T1Font };
export type LoadedFont = { key: string; parsed: ParsedFont; size: number };

function keyOf(f: EngineFont) {
	return f.t1 ? `${f.t1.pfb}|${f.t1.enc ?? ''}` : f.file;
}

export function createFontOutlines(read: FontFileReader) {
	const parsed = new Map<string, Promise<ParsedFont | null>>();
	const glyphs = new Map<string, string | null>();

	async function parse(f: EngineFont): Promise<ParsedFont | null> {
		try {
			if (f.t1) {
				const [pfb, enc] = await Promise.all([read(f.t1.pfb), f.t1.enc ? read(f.t1.enc) : null]);
				const t1 = parseT1(new Uint8Array(pfb), enc ? new TextDecoder().decode(enc) : null);
				return t1 ? { t1 } : null;
			}
			if (!/\.(otf|ttf|ttc)$/i.test(f.file)) return null;
			return { ot: opentype.parse(sfntFromTtc(await read(f.file), 0)) };
		} catch {
			return null;
		}
	}

	/** the fonts one render uses, by the engine's font id */
	async function loadFonts(fonts: EngineFont[]) {
		const out = new Map<number, LoadedFont>();
		await Promise.all(
			fonts.map(async (f) => {
				const key = keyOf(f);
				if (!key) return;
				if (!parsed.has(key)) parsed.set(key, parse(f));
				const font = await parsed.get(key)!;
				if (font) out.set(f.id, { key, parsed: font, size: f.size * BP_PER_PT });
			})
		);
		return out;
	}

	/** the glyph's outline as svg path data, y down, at the font's size in bp */
	function outline(font: LoadedFont, code: number, gi?: number) {
		const id = `${font.key}|${font.size}|${code}|${gi ?? ''}`;
		if (glyphs.has(id)) return glyphs.get(id)!;
		let d: string | null = null;
		if (font.parsed.t1) {
			const path = font.parsed.t1.pathForSlot(code, 0, 0, font.size);
			d = path
				? path.commands
						.map((c) =>
							c.type === 'Z'
								? 'Z'
								: c.type === 'C'
									? `C${c.x1!.toFixed(3)} ${c.y1!.toFixed(3)} ${c.x2!.toFixed(3)} ${c.y2!.toFixed(3)} ${c.x!.toFixed(3)} ${c.y!.toFixed(3)}`
									: `${c.type}${c.x!.toFixed(3)} ${c.y!.toFixed(3)}`
						)
						.join('')
				: null;
		} else if (font.parsed.ot) {
			const glyph = gi != null ? font.parsed.ot.glyphs.get(gi) : font.parsed.ot.charToGlyph(String.fromCodePoint(code));
			d = glyph ? glyph.getPath(0, 0, font.size).toPathData(3) || null : null;
		}
		glyphs.set(id, d);
		return d;
	}

	return { loadFonts, outline };
}
