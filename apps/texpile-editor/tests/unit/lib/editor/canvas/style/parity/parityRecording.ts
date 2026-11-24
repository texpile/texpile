// S1.0's recordings of the DOM editor's computed styles, expanded, and the comparison styleParity applies (plan 5.2)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LayoutStyle, PaintStyle, RunStyle } from '$lib/editor/canvas/contracts/styleTypes';

type Plain = Record<string, unknown>;
export type RecordedRow = { pos: number; nodeType: string; path: string; pseudo: string; layout: LayoutStyle; paint: PaintStyle };
export type RecordedRun = { block: number; chain: string[]; style: RunStyle };
export type Recording = { rows: RecordedRow[]; root: RecordedRow; runs: RecordedRun[] };

const STYLES = join(import.meta.dirname, '../../../../../../fixtures/parity/styles');
const PARITY_DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';

function isPlain(value: unknown): value is Plain {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function expand<T>(delta: unknown, base: T): T {
	if (delta === undefined) return structuredClone(base);
	if (!isPlain(delta) || !isPlain(base)) return structuredClone(delta) as T;
	const out: Plain = {};
	for (const key of new Set([...Object.keys(base), ...Object.keys(delta)])) out[key] = expand(delta[key], base[key]);
	return out as T;
}

export function loadRecording(name: string): Recording {
	const file = JSON.parse(readFileSync(join(STYLES, name), 'utf8')) as {
		initial: { layout: LayoutStyle; paint: PaintStyle };
		values: { layout: unknown[]; paint: unknown[]; run: unknown[] };
		rows: [number, string, string, string, number, number][];
		runs: [number, number, number, string[], number][];
	};
	const rows = file.rows.map(([pos, nodeType, path, pseudo, layoutId, paintId]) => ({
		pos,
		nodeType,
		path,
		pseudo,
		layout: expand(file.values.layout[layoutId], file.initial.layout),
		paint: expand(file.values.paint[paintId], file.initial.paint)
	}));
	const runs = file.runs.map(([block, , , chain, runId]) => ({ block, chain, style: file.values.run[runId] as RunStyle }));
	return { rows, root: rows[0], runs };
}

export function parityDocumentPath(folder: string, file: string): string | null {
	const path = join(PARITY_DOCS, folder, file);
	try {
		readFileSync(path);
		return path;
	} catch {
		return null;
	}
}

function flatten(value: unknown, path: string, out: Map<string, unknown>): void {
	if (isPlain(value)) for (const key of Object.keys(value)) flatten(value[key], path ? `${path}.${key}` : key, out);
	else out.set(path, value);
}

function flat(layout: LayoutStyle, paint: PaintStyle): Map<string, unknown> {
	const out = new Map<string, unknown>();
	flatten(layout, 'layout', out);
	flatten(paint, 'paint', out);
	return out;
}

// each normalization below is listed in fixtures/parity/styles/deviations.json
const JUSTIFIED_AS = new Set(['start', 'left', 'justify']);
// the canvas draws its own carets: caret-color only says which one the DOM editor hid
const IGNORED = /^layout\.(counters|content)\b|^paint\.caretColor\b/;
// gap applies to flex, grid and multicolumn boxes only
const GAP = /^layout\.(gap|columns\.gap)\b/;
const FLEXIBLE = new Set(['flex', 'inline-flex', 'grid', 'inline-grid']);
const PX = 0.05;
const CHANNEL = 2 / 255;
const ALPHA = 0.01;

function opaque(shadows: unknown): unknown {
	return (shadows as { color: { a: number } }[]).filter((shadow) => shadow.color.a !== 0);
}

function sameValue(path: string, expected: unknown, actual: unknown): boolean {
	if (typeof expected === 'number' && typeof actual === 'number') {
		const slack = /\.(r|g|b)$/.test(path) ? CHANNEL : path.endsWith('.a') ? ALPHA : PX;
		return Math.abs(expected - actual) <= slack;
	}
	if (path === 'layout.font.families') return String(expected).replace(/['"]/g, '') === String(actual).replace(/['"]/g, '');
	if (path === 'layout.textAlign' && expected === 'justify') return JUSTIFIED_AS.has(actual as string);
	return JSON.stringify(expected) === JSON.stringify(actual);
}

/** property paths where the canvas style differs from the recorded one; `only` keeps the properties a look owns, `skip` drops the ones another view sets */
export function styleDifferences(
	expected: { layout: LayoutStyle; paint: PaintStyle },
	actual: { layout: LayoutStyle; paint: PaintStyle },
	only?: RegExp,
	skip?: RegExp
): string[] {
	const want = flat(expected.layout, expected.paint);
	const got = flat(actual.layout, actual.paint);
	const differences: string[] = [];
	for (const [path, value] of want) {
		if (IGNORED.test(path) || (only && !only.test(path)) || skip?.test(path)) continue;
		if (GAP.test(path) && !FLEXIBLE.has(expected.layout.display)) continue;
		if (path === 'paint.boxShadow') {
			if (JSON.stringify(opaque(value)) !== JSON.stringify(opaque(got.get(path))))
				differences.push(`${path}: ${JSON.stringify(opaque(value))} vs ${JSON.stringify(opaque(got.get(path)))}`);
			continue;
		}
		if (!sameValue(path, value, got.get(path)))
			differences.push(`${path}: recorded ${JSON.stringify(value)}, canvas ${JSON.stringify(got.get(path))}`);
	}
	return differences;
}

/** the run values a mark tag decides: font, edges and paint; the recorded run is sparse against the initial font */
export function runDifferences(recorded: RunStyle, actual: RunStyle): string[] {
	const pick = (run: RunStyle): { layout: LayoutStyle; paint: PaintStyle } =>
		({ layout: { font: { ...run.font }, edges: run.edges, verticalAlign: run.verticalAlign }, paint: run.paint }) as unknown as {
			layout: LayoutStyle;
			paint: PaintStyle;
		};
	const want = flat(pick(recorded).layout, pick(recorded).paint);
	const got = flat(pick(actual).layout, pick(actual).paint);
	const differences: string[] = [];
	for (const [path, value] of want)
		if (!sameValue(path, value, got.get(path)))
			differences.push(`${path}: recorded ${JSON.stringify(value)}, canvas ${JSON.stringify(got.get(path))}`);
	return differences;
}
