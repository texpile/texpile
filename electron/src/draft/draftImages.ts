// Attaches figure FILENAMES to a compile's image records -- nothing else.
// The engine's image rule nodes carry no filename, but they DO carry an index, numbered per
// distinct file, and the SAME RUN's log names every inclusion (`<use FILE>`) in first-use
// order -- so index N is the Nth distinct file. Records from a compile predating that index
// fall back to the older join by requested size, which could swap two same-sized figures.
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

/* eslint-disable no-param-reassign -- rewrites the handed lines (and marks uses spent) in place, per the doc comment */
/** Rewrites {"t":"image"} lines in place, adding the resolved absolute file path. */
export function attachImageFiles(lines: string[], uses: ImageUse[], root: string): void {
	if (!uses.length) return;
	// The engine numbers images per DISTINCT FILE, and the log names them in first-use order,
	// so index N is the Nth distinct file. That is an exact correspondence where matching by
	// requested size is not: two different figures at identical sizes could swap.
	const distinct: string[] = [];
	for (const u of uses) if (!distinct.includes(u.file)) distinct.push(u.file);
	function abs(file: string): string {
		return (path.isAbsolute(file) ? file : path.join(root, file)).replace(/\\/g, '/');
	}
	function resolveUse(w: number, h: number): string | null {
		function near(f: { w: number; h: number }): boolean {
			return Math.abs(f.w - w) < 0.1 && Math.abs(f.h - h) < 0.1;
		}
		const hit = uses.find((f) => !f.used && near(f)) ?? uses.find(near);
		if (!hit) return null;
		hit.used = true;
		return (path.isAbsolute(hit.file) ? hit.file : path.join(root, hit.file)).replace(/\\/g, '/');
	}
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].startsWith('{"t":"image"')) continue;
		try {
			const r = JSON.parse(lines[i]);
			// the engine's own index when the record carries one; the size join only for
			// records from a compile that predates it
			const byIndex = typeof r.ix === 'number' && distinct[r.ix - 1] ? abs(distinct[r.ix - 1]) : null;
			const file = byIndex ?? resolveUse(r.w, (r.h || 0) + (r.d || 0));
			if (file) {
				r.file = file;
				lines[i] = JSON.stringify(r);
			}
		} catch {
			/* keep the raw line */
		}
	}
}
