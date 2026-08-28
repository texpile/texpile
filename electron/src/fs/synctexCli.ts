// shell out to the synctex CLI rather than parse .synctex.gz ourselves; the fiddly coordinate
// math is its job, and it finds the .synctex(.gz) next to the PDF on its own
import { execFile } from 'node:child_process';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { shellEnvReady } from '../shell/shellEnv';

async function runSynctex(args: string[]): Promise<string> {
	await shellEnvReady();
	return new Promise((res, rej) => {
		execFile('synctex', args, { timeout: 10000, maxBuffer: 1 << 20 }, (err, stdout) => {
			// synctex exits non-zero on "no match" but still prints useful output; only reject on empty
			if (err && !stdout) rej(err);
			else res(stdout || '');
		});
	});
}

// synctex prints Key:Value records; take the first occurrence of each key (the best match)
function firstFields(out: string): Record<string, string> {
	const map: Record<string, string> = {};
	for (const line of out.split(/\r?\n/)) {
		const i = line.indexOf(':');
		if (i <= 0) continue;
		const k = line.slice(0, i).trim();
		if (!(k in map)) map[k] = line.slice(i + 1).trim();
	}
	return map;
}

// all result records ('Page:' starts a new one). Draft mode's instant patch needs every
// line box of the paragraph, not just the best match. Lowercase h/v are the BOX's own
// left/baseline (x/y are the sync point, which can sit mid-line); bl = box left, the
// column-exact anchor for the instant patch.
function allBoxes(out: string): { page: number; x: number; y: number; W: number; H: number; bl?: number }[] {
	const boxes: { page: number; x: number; y: number; W: number; H: number; bl?: number }[] = [];
	let cur: Record<string, number> | null = null;
	for (const line of out.split(/\r?\n/)) {
		const m = line.match(/^(Page|x|y|W|H|h):(.+)$/);
		if (!m) continue;
		if (m[1] === 'Page') {
			if (cur) boxes.push({ page: cur.Page, x: cur.x, y: cur.y, W: cur.W, H: cur.H, bl: cur.bl });
			cur = {};
		}
		if (cur) cur[m[1] === 'h' ? 'bl' : m[1]] = parseFloat(m[2]);
	}
	if (cur && cur.Page !== undefined) boxes.push({ page: cur.Page, x: cur.x, y: cur.y, W: cur.W, H: cur.H, bl: cur.bl });
	return boxes.filter((b) => Number.isFinite(b.page) && Number.isFinite(b.y));
}

export type SynctexBody = {
	action?: string;
	pdf?: string;
	tex?: string;
	line?: number;
	column?: number;
	page?: number;
	x?: number;
	y?: number;
};

export async function synctex(body: SynctexBody): Promise<Record<string, unknown>> {
	const pdf = String(body?.pdf ?? '');
	if (!pdf) return { ok: false, error: 'Missing pdf path' };
	try {
		if (body.action === 'view') {
			const tex = String(body.tex ?? '');
			const line = Number(body.line ?? 0);
			const col = Number(body.column ?? 0);
			const out = await runSynctex(['view', '-i', `${line}:${col}:${tex}`, '-o', pdf]);
			const f = firstFields(out);
			if (!f.Page) return { ok: false, error: 'No SyncTeX match. Compile with -synctex=1 first.' };
			return {
				ok: true,
				page: Number(f.Page),
				x: Number(f.x),
				y: Number(f.y),
				h: Number(f.h),
				v: Number(f.v),
				width: Number(f.W),
				height: Number(f.H),
				// every result record; Draft mode's instant patch needs the paragraph's full
				// extent (line boxes), not just the best match
				boxes: allBoxes(out)
			};
		}
		if (body.action === 'edit') {
			const page = Number(body.page ?? 1);
			const x = Number(body.x ?? 0);
			const y = Number(body.y ?? 0);
			const f = firstFields(await runSynctex(['edit', '-o', `${page}:${x}:${y}:${pdf}`]));
			if (!f.Input) return { ok: false, error: 'No SyncTeX match.' };
			// synctex's Input path often has a literal `/./` segment; unnormalized, the client treats it
			// as a different file and spuriously reloads. Relative inputs resolve against the PDF's dir,
			// then its parent for -output-directory layouts.
			let input = f.Input;
			if (isAbsolute(input)) {
				input = normalize(input);
			} else {
				const byPdf = resolve(dirname(pdf), input);
				input = existsSync(byPdf) ? byPdf : resolve(dirname(pdf), '..', input);
			}
			return { ok: true, input, line: Number(f.Line), column: Number(f.Column) };
		}
		return { ok: false, error: 'Unknown action' };
	} catch (e) {
		const code = (e as { code?: string })?.code;
		if (code === 'ENOENT') return { ok: false, error: 'The `synctex` tool was not found on PATH (install a TeX distribution).' };
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
