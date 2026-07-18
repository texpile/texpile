// Attaches figure FILENAMES to a compile's image records -- nothing else.
// The engine's image rule nodes carry no filename, but the SAME RUN's log records every
// inclusion (`<use FILE>` + "Requested size: WxH"): a same-run join by those exact
// dimensions recovers the correspondence the engine had but didn't serialize. Distinct
// files at identical sizes fall back to log order (only ever swaps two same-sized figures).
import * as path from 'node:path';
import * as fs from 'node:fs';

export type ImageUse = { file: string; w: number; h: number; used: boolean };

export function readImageUses(outAbs: string): ImageUse[] {
	const uses: ImageUse[] = [];
	try {
		const log = fs.readFileSync(path.join(outAbs, 'draft.log'), 'utf8');
		const re = /<use ([^>]+)>[\s\S]{0,300}?Requested size: ([\d.]+)pt x ([\d.]+)pt/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(log))) uses.push({ file: m[1], w: parseFloat(m[2]), h: parseFloat(m[3]), used: false });
	} catch {
		/* no log -> records stay file-less (renderer placeholders) */
	}
	return uses;
}

/** Rewrites {"t":"image"} lines in place, adding the resolved absolute file path. */
export function attachImageFiles(lines: string[], uses: ImageUse[], root: string): void {
	if (!uses.length) return;
	const resolve = (w: number, h: number): string | null => {
		const near = (f: { w: number; h: number }) => Math.abs(f.w - w) < 0.1 && Math.abs(f.h - h) < 0.1;
		const hit = uses.find((f) => !f.used && near(f)) ?? uses.find(near);
		if (!hit) return null;
		hit.used = true;
		return (path.isAbsolute(hit.file) ? hit.file : path.join(root, hit.file)).replace(/\\/g, '/');
	};
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].startsWith('{"t":"image"')) continue;
		try {
			const r = JSON.parse(lines[i]);
			const file = resolve(r.w, (r.h || 0) + (r.d || 0));
			if (file) {
				r.file = file;
				lines[i] = JSON.stringify(r);
			}
		} catch {
			/* keep the raw line */
		}
	}
}
