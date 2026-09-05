/* eslint-disable @typescript-eslint/no-explicit-any */
// Parsed font cache for the record renderer. Font ids are per-compile (the daemon numbers
// fonts independently of the page compile), so fonts cache by FILE PATH and map ids per
// record-set.
// opentype.js 2.x ESM has no default export -- use the namespace (opentype.parse)
import * as opentype from 'opentype.js';
import { sfntFromTtc } from './ttc';
import { parseT1, type T1Font } from './type1/t1font';
import { fileUrl } from '$lib/workspace/fileSystem';

export class DraftFonts {
	private byFile = new Map<string, { ot?: any; t1?: T1Font } | null>();

	// Type1 fonts are cached per (pfb, enc) pair: the same pfb can be reencoded differently
	t1Key(r: any): string {
		return r.t1.pfb + '|' + (r.t1.enc || '');
	}
	// a .ttc collection holds several faces under one path: cache per (file, face)
	otKey(r: any): string {
		return r.sub ? `${r.file}#${r.sub}` : r.file;
	}

	async ensureFonts(records: any[]): Promise<void> {
		// a classic Type1 font record carries `t1` ({ pfb, enc }) instead of a parseable file
		const jobs: Promise<void>[] = [];
		const seen = new Set<string>();
		for (const r of records) {
			if (r.t !== 'font') continue;
			const key = r.t1 ? this.t1Key(r) : this.otKey(r);
			if (!key || this.byFile.has(key) || seen.has(key)) continue;
			seen.add(key);
			jobs.push(
				(async () => {
					try {
						if (r.t1) {
							const [pfb, enc] = await Promise.all([
								fetch(fileUrl(r.t1.pfb), { cache: 'force-cache' }).then((x) => x.arrayBuffer()),
								r.t1.enc ? fetch(fileUrl(r.t1.enc), { cache: 'force-cache' }).then((x) => x.text()) : null
							]);
							const t1 = parseT1(new Uint8Array(pfb), enc);
							this.byFile.set(key, t1 ? { t1 } : null);
						} else {
							const buf = await (await fetch(fileUrl(r.file), { cache: 'force-cache' })).arrayBuffer();
							this.byFile.set(key, { ot: opentype.parse(sfntFromTtc(buf, (r.sub || 1) - 1)) });
						}
					} catch {
						this.byFile.set(key, null);
					}
				})()
			);
		}
		await Promise.all(jobs);
	}

	idMapFor(records: any[]): Record<number, { ot?: any; t1?: T1Font; size: number } | null> {
		const m: Record<number, { ot?: any; t1?: T1Font; size: number } | null> = {};
		for (const r of records) {
			if (r.t !== 'font') continue;
			const key = r.t1 ? this.t1Key(r) : this.otKey(r);
			const f = key ? this.byFile.get(key) : null;
			m[r.id] = f ? { ot: f.ot, t1: f.t1, size: r.size } : null;
		}
		return m;
	}

	// any glyph whose font the renderer cannot ink (no font record, failed fetch/parse):
	// the patch GEOMETRY is still engine-exact, but the live frame would show a silent
	// gap where that ink belongs -- the caller refuses the render (font-missing) and the
	// full pass shows the real glyphs
	async missingInk(records: any[]): Promise<boolean> {
		await this.ensureFonts(records);
		const idMap = this.idMapFor(records);
		for (const r of records) if (r.t === 'g' && !idMap[r.f]) return true;
		return false;
	}

	/** Type1 slots map to text through the parsed font's AGL table (wordAt) */
	textMapOf(r: any): number[] | undefined {
		return r.t1 ? this.byFile.get(this.t1Key(r))?.t1?.textMap : undefined;
	}
}
