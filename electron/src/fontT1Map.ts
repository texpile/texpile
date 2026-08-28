// Resolves a font record's Type1 sources (.pfb + .enc paths) -- nothing else.
// The engine's own map file (pdftex.map) names the .pfb and the reencoding .enc per
// font, located via kpsewhich -- the same pair the real PDF embeds.
// Attached to font records as `t1`; the renderer parses the actual font and draws its
// actual outlines (apps/texpile-editor/src/lib/draft/type1). No tables, no substitution.
// Everything here is ASYNC: kpsewhich spawns take 50-200ms each and a synchronous call
// in the main process froze the whole UI during compile-result processing.
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { shellEnvReady } from './shell/shellEnv';

/* eslint-disable @typescript-eslint/no-explicit-any -- font records are schemaless engine JSON */

// Font files live OUTSIDE every workspace root (TeX trees, system fonts), so the
// texfile:// claimed-root confinement would 403 the renderer's fetches and every
// records-drawn page would paint no glyphs at all. Admit exactly the paths this module
// attaches to font records -- an exact-match set, so the workspace confinement stays the
// only path-prefix rule.
const FONT_EXT = /\.(pfb|enc|otf|ttf|ttc)$/i;
const allowedFonts = new Set<string>();
function fontKey(p: string): string {
	const n = path.normalize(p);
	return process.platform === 'win32' ? n.toLowerCase() : n;
}
function registerFontPath(p: string | null | undefined): void {
	if (p && FONT_EXT.test(p)) allowedFonts.add(fontKey(p));
}
export function isAllowedFontPath(p: string): boolean {
	return allowedFonts.has(fontKey(p));
}

const kpseCache = new Map<string, Promise<string | null>>();
function kpsewhich(file: string): Promise<string | null> {
	let p = kpseCache.get(file);
	if (!p) {
		p = shellEnvReady().then(
			() =>
				new Promise<string | null>((resolve) => {
					execFile('kpsewhich', [file], { timeout: 15000 }, (err, stdout) => {
						resolve(err ? null : stdout.toString().trim().replace(/\\/g, '/') || null);
					});
				})
		);
		kpseCache.set(file, p);
	}
	return p;
}

type MapEntry = { pfb: string; enc?: string };
let mapIndex: Promise<Map<string, MapEntry> | null> | undefined;
function loadMap(): Promise<Map<string, MapEntry> | null> {
	if (mapIndex !== undefined) return mapIndex;
	mapIndex = (async () => {
		const p = await kpsewhich('pdftex.map');
		if (!p) return null;
		try {
			const idx = new Map<string, MapEntry>();
			for (const line of (await fs.promises.readFile(p, 'utf8')).split('\n')) {
				if (!line || line.startsWith('%') || line.startsWith('#')) continue;
				const toks = line.trim().split(/\s+/);
				let pfb: string | undefined, enc: string | undefined;
				for (const t of toks) {
					if (t[0] !== '<') continue;
					const f = t.replace(/^<+\[?/, ''); // <file, <<file, <[file
					if (f.endsWith('.enc')) enc = f;
					else if (f.endsWith('.pfb')) pfb = f;
				}
				if (pfb) idx.set(toks[0], { pfb, enc });
			}
			return idx;
		} catch {
			return null;
		}
	})();
	return mapIndex;
}

const DRAWABLE = /\.(otf|ttf|ttc)$/i;

/* eslint-disable no-param-reassign -- attaching t1 to the handed record IS this function's job */
/** Adds `t1` ({ pfb, enc } abs paths) to a font record the renderer can't parse directly. */
export async function resolveType1(rec: any): Promise<void> {
	if (!rec || rec.t !== 'font') return;
	if (rec.file && DRAWABLE.test(rec.file)) {
		registerFontPath(rec.file);
		return;
	}
	const name = String(rec.name || '');
	if (!name) return;
	const e = (await loadMap())?.get(name);
	if (!e) return;
	const pfb = await kpsewhich(e.pfb);
	if (!pfb) return;
	rec.t1 = { pfb, enc: e.enc ? await kpsewhich(e.enc) : null };
	registerFontPath(rec.t1.pfb);
	registerFontPath(rec.t1.enc);
}
/* eslint-enable no-param-reassign */

/** Line-wise variant for the page-record strings the compile service returns. */
export async function resolveType1Line(line: string): Promise<string> {
	if (!line.startsWith('{"t":"font"')) return line;
	try {
		const rec = JSON.parse(line);
		await resolveType1(rec);
		return rec.t1 ? JSON.stringify(rec) : line;
	} catch {
		return line;
	}
}
