import { it } from 'vitest';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as now from '$lib/languages/latex/texCode';
import * as old from '$lib/languages/latex/zzOldTexCode';

const DIR = process.env.CORPUS_DIR!;
const OUT = process.env.MASK_OUT!;

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		const p = join(dir, f);
		return statSync(p).isDirectory() ? walk(p) : f.endsWith('.tex') ? [p] : [];
	});
}

const MODES = {
	codeOnly: (m: typeof now, t: string) => m.codeOnly(t),
	openings: (m: typeof now, t: string) => m.codeKeepingOpenings(t),
	verbatim: (m: typeof now, t: string) => m.blankUnread(t, { masked: 'verbatim', openings: true })
};

it.runIf(DIR)('old and new masking agree', () => {
	const report: Record<string, { chars: number; differ: number; files: number; samples: string[] }> = {};
	for (const path of walk(DIR)) {
		const text = readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
		if (text.length > 600_000) continue;
		for (const [mode, run] of Object.entries(MODES)) {
			const r = (report[mode] ??= { chars: 0, differ: 0, files: 0, samples: [] });
			const a = run(old as typeof now, text);
			const b = run(now, text);
			r.chars += text.length;
			if (a === b) continue;
			r.files++;
			let shown = 0;
			for (let i = 0; i < text.length; i++) {
				if (a[i] === b[i]) continue;
				r.differ++;
				if (shown++ < 2 && r.samples.length < 80) {
					const kind = a[i] === ' ' ? 'old blanks' : 'new blanks';
					r.samples.push(`${kind} ${path.slice(DIR.length)} ${JSON.stringify(text.slice(Math.max(0, i - 50), i) + '⟦' + text[i] + '⟧' + text.slice(i + 1, i + 30))}`);
					while (i < text.length && a[i] !== b[i]) i++;
				}
			}
		}
	}
	writeFileSync(OUT, JSON.stringify(report, null, 1));
}, 3_600_000);
