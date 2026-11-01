// inert unless CORPUS_DIR is set and lualatex is on the PATH; OUT_DIR gets one svg per picture and report.json
// TeX runs on these files: point it only at figures you trust (shell escape is off)
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, readLualatexFile, useLualatex } from '../../engines/lualatexEngine';
import type { EngineResult } from '$lib/draw/tikz/tikzResult';
import { boundsOf } from '$lib/draw/editor/canvas/drawing/partBounds';
import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';
import type { Drawing } from '$lib/draw/editor/drawing/drawing.types';
import { createFontOutlines } from '$lib/draw/editor/drawing/fontOutlines';
import { canvasPoint } from '$lib/draw/editor/figure/geometry';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { describeStatement } from '$lib/draw/tikz/describeStatement';
import { pgfTransform } from '$lib/draw/tikz/renderTikz';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { namedPoints } from '$lib/draw/tikz/source/moves/namedPoints';
import { moveWay, shiftStatement } from '$lib/draw/tikz/source/moves/statementMoves';
import { readCommandOptions, writeCommandOptions } from '$lib/draw/tikz/source/options/optionList';
import { targetOf, withStroke } from '$lib/draw/tikz/source/options/styleOptions';
import { listPictures, readPicture, type Picture, type Statement } from '$lib/draw/tikz/source/picture';

const CORPUS = process.env.CORPUS_DIR;
const OUT = process.env.OUT_DIR ?? join(process.cwd(), 'corpus-out');
const MOVES_PER_PICTURE = 4;
const BP_PER_CM = 72 / 2.54;

function texFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		// _draft and tikzcap- are what the old desktop engine left in a folder
		if (name.startsWith('.') || name === '_draft' || name.startsWith('tikzcap-')) return [];
		return statSync(path).isDirectory() ? texFiles(path) : name.endsWith('.tex') ? [path] : [];
	});
}

type PictureReport = {
	file: string;
	index: number;
	ms: number;
	errors: string[];
	statements: number;
	movable: number;
	parts: number;
	unsupported: string[];
	/** shifted-partly: a point it shares with another statement (a named node) stays where it was */
	moves: {
		stmt: number;
		how: MoveKind;
		outcome: 'exact' | 'shifted-partly' | 'draws-nothing' | 'new-errors';
		dx: number;
		expected: number;
	}[];
	recolor: 'ok' | 'new-errors' | 'none';
};

type MoveKind = NonNullable<ReturnType<typeof moveWay>> | 'scope';

const moveKind = (source: string, st: Statement): MoveKind => (st.kind === 'scope' ? 'scope' : (moveWay(source, st) ?? 'points'));

/** the first few movable statements of each kind */
function eachKind<T extends { st: Statement }>(source: string, movable: T[]) {
	const taken = new Map<MoveKind, number>();
	return movable.filter(({ st }) => {
		const how = moveKind(source, st);
		taken.set(how, (taken.get(how) ?? 0) + 1);
		return taken.get(how)! <= MOVES_PER_PICTURE;
	});
}

/** moved as the canvas moves it: half a unit right, with the coordinates a path is drawn through when it takes them */
function moved(source: string, picture: Picture, st: Statement, result: EngineResult) {
	const named = namedPoints(source, picture, st);
	const all = [st, ...(named.movable ? named.points : [])].sort((a, b) => b.from - a.from);
	return all.reduce((text, s) => {
		const m = pgfTransform(result.marks.find((k) => k.i === s.i)?.m ?? [1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
		const [x0, y0] = canvasPoint(0, 0, m);
		const [x1, y1] = canvasPoint(0.5, 0, m);
		return shiftStatement(text, s, 0.5, 0, [(x1 - x0) / BP_PER_CM, (y1 - y0) / BP_PER_CM]);
	}, source);
}

function boundsFor(drawing: Drawing, stmt: number, sizes: Map<number, number>) {
	return boundsOf(
		drawing.parts.filter((p) => p.stmt === stmt),
		(f) => sizes.get(f) ?? 10
	);
}

describe.skipIf(!CORPUS || !hasLualatex)('corpus', () => {
	useLualatex();

	it('draws and edits every picture', { timeout: 6 * 60 * 60 * 1000 }, async () => {
		mkdirSync(OUT, { recursive: true });
		const reports: PictureReport[] = [];
		const outlines = createFontOutlines(readLualatexFile);
		for (const file of texFiles(CORPUS!)) {
			const text = readFileSync(file, 'utf8');
			const at = text.indexOf('\\begin{document}');
			if (at < 0) continue;
			const preamble = text.slice(0, at);
			const pictures = listPictures(text).length;
			if (!pictures) continue;
			const render = async (source: string, index: number): Promise<EngineResult | null> => {
				try {
					return await drawWithLualatex(preamble, instrumentPicture(source, readPicture(source, index)!), dirname(file));
				} catch (e) {
					// a trap leaves the engine to start afresh on the next picture
					return { ms: 0, stop: false, w: 0, h: 0, d: 0, marks: [], recs: [], fonts: [], shadings: {}, errors: [String(e)] };
				}
			};
			for (let index = 0; index < pictures; index++) {
				const pic = readPicture(text, index)!;
				const result = await render(text, index);
				if (!result) continue;
				const drawing = buildDrawing(result);
				const fonts = await outlines.loadFonts(result.fonts);
				const sizes = new Map([...fonts].map(([id, f]) => [id, f.size]));
				const name = `${relative(CORPUS!, file)
					.replace(/[/\\]/g, '__')
					.replace(/\.tex$/, '')}-${index}`;
				writeFileSync(join(OUT, `${name}.svg`), drawingToSvg(drawing, fonts, outlines.outline));
				const infos = pic.statements.map((st) => ({ st, info: describeStatement(text, st) }));
				const report: PictureReport = {
					file: relative(CORPUS!, file),
					index,
					ms: result.ms,
					errors: result.errors,
					statements: pic.statements.length,
					movable: infos.filter((x) => x.info.movable).length,
					parts: drawing.parts.length,
					unsupported: drawing.unsupported,
					moves: [],
					recolor: 'none'
				};
				for (const { st } of eachKind(
					text,
					infos.filter((x) => x.info.movable)
				)) {
					const after = await render(moved(text, pic, st, result), index);
					if (!after) continue;
					const m = result.marks.find((k) => k.i === st.i)?.m ?? [1, 0, 0, 1, 0, 0];
					const expected = canvasPoint(0.5, 0, pgfTransform(m))[0] - canvasPoint(0, 0, pgfTransform(m))[0];
					const b0 = boundsFor(drawing, st.i, sizes);
					const b1 = boundsFor(buildDrawing(after), st.i, sizes);
					const dx = b0 && b1 ? (b1.x1 + b1.x2 - b0.x1 - b0.x2) / 2 : 0;
					const outcome =
						after.errors.length > result.errors.length
							? 'new-errors'
							: !b0
								? 'draws-nothing'
								: Math.abs(dx - expected) < 0.5
									? 'exact'
									: 'shifted-partly';
					report.moves.push({ stmt: st.i, how: moveKind(text, st), outcome, dx: +dx.toFixed(2), expected: +expected.toFixed(2) });
				}
				const styled = infos.find((x) => x.info.target && x.info.target !== 'fill');
				if (styled) {
					const options = readCommandOptions(text, styled.st)!;
					const recolored = writeCommandOptions(text, options, withStroke(options.items, targetOf(styled.st.command)!, 'red'));
					const after = await render(recolored, index);
					report.recolor = after && after.errors.length <= result.errors.length ? 'ok' : 'new-errors';
				}
				reports.push(report);
			}
		}
		writeFileSync(join(OUT, 'report.json'), JSON.stringify(reports, null, 1));
		const moves = reports.flatMap((r) => r.moves);
		const count = (o: string) => moves.filter((m) => m.outcome === o).length;
		console.log(
			[
				`files ${new Set(reports.map((r) => r.file)).size}, pictures ${reports.length}, statements ${reports.reduce((n, r) => n + r.statements, 0)}, movable ${reports.reduce((n, r) => n + r.movable, 0)}`,
				`pictures with TeX errors ${reports.filter((r) => r.errors.length).length}, empty drawings ${reports.filter((r) => !r.parts).length}`,
				`median ms ${reports.map((r) => r.ms).sort((a, b) => a - b)[reports.length >> 1]}, max ms ${Math.max(...reports.map((r) => r.ms))}`,
				`moves ${moves.length}: exact ${count('exact')}, shifted partly ${count('shifted-partly')}, new errors ${count('new-errors')}`,
				...(['points', 'placed', 'loop', 'named', 'option', 'scope'] as const).map((how) => {
					const of = moves.filter((m) => m.how === how);
					return `  ${how}: ${of.length} moves, exact ${of.filter((m) => m.outcome === 'exact').length}, partly ${of.filter((m) => m.outcome === 'shifted-partly').length}, new errors ${of.filter((m) => m.outcome === 'new-errors').length}, draws nothing ${of.filter((m) => m.outcome === 'draws-nothing').length}`;
				}),
				`recolor: ok ${reports.filter((r) => r.recolor === 'ok').length}, new errors ${reports.filter((r) => r.recolor === 'new-errors').length}`,
				`unsupported ops: ${[...new Set(reports.flatMap((r) => r.unsupported))].join(' ') || 'none'}`
			].join('\n')
		);
		expect(reports.length).toBeGreaterThan(0);
	});
});
