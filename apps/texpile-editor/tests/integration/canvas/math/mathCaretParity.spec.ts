// the caret oracle (design 13.10): P0's keys and clicks in 52 formulas of the parity documents, replayed on the canvas's
// formula session. Offsets and selections exact, the caret within 1 px of where MathLive's own caret stood
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { CanvasProbe } from '$lib/editor/canvas';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { probeErrors, settled } from '../canvasPage';
import { MathCaretReplay, mathFixtures, type MathFixture } from './mathCaretReplay';

const DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';
// one grid point in GRID_STRIDE: the full grid is some 6000 clicks
const GRID_STRIDE = Number(process.env.MATH_GRID_STRIDE ?? 3);
// the documents' figures point outside the folder the window has a copy of
const MISSING_FIGURE = /Failed to load resource: the server responded with a status of 40[34]/;

// MATH_FIXTURES=id,id replays only those formulas
// rows P0 resolves by DOM metrics the canvas has no copy of: a 0.03 px glyph advance (KaTeX 0.5 em against the font's 0.501),
// a press that P0's DOM hit test sends past a call of the paper's own macro, and an empty cell whose first rect sits 13 px higher;
// P0's span of a call took presses above its ink (the span's font box), the canvas's call box is the ink's: \CAlg's top
// is 7.45 px down and grid 14,2 at 8 px lands on either side of it by the paper's scroll fraction
const KNOWN_DEVIATIONS = [
	/^s1-display-array-rl Up@72:/,
	/^s1-display-array-rl grid (3|6),/,
	/^pp-display-align-frac grid 44,1:/,
	/^pp-display-big-brackets-frac grid 14,2:/
];

const only = process.env.MATH_FIXTURES?.split(',');
const fixtures = mathFixtures().filter((fixture) => !only || only.includes(fixture.id));
const documents = [...new Set(fixtures.map((fixture) => `${fixture.formula.document.folder}/${fixture.formula.document.file}`))];
const present = documents.filter((name) => fs.existsSync(path.join(DOCS, name)));
const texpile = useTexpile({ files: Object.fromEntries(present.map((name) => [name, fs.readFileSync(path.join(DOCS, name), 'utf8')])) });

/** the formula node holding the fixture's source nearest its recorded position: its start and end */
function formulaAt(visual: VisualEditor, fixture: MathFixture): Promise<{ pos: number; end: number }> {
	return visual.evalView<{ pos: number; end: number }>(
		`let best = { pos: -1, end: -1 }; view.state.doc.descendants((node, pos) => {
			const nearer = best.pos < 0 || Math.abs(pos - arg.pos) < Math.abs(best.pos - arg.pos);
			if (node.type.name === arg.type && node.textContent === arg.source && nearer) best = { pos, end: pos + node.nodeSize };
		}); return best;`,
		fixture.formula
	);
}

for (const name of documents) {
	test(`formulas of ${name} keep P0's carets`, async () => {
		test.skip(!present.includes(name), `no ${path.join(DOCS, name)}`);
		test.setTimeout(1_800_000);
		const { page } = texpile();
		const visual = new VisualEditor(page, texpile().root);
		// the 703 KB paper takes longer to show than one open waits
		await expect
			.poll(
				() =>
					visual.open(name).then(
						() => true,
						() => false
					),
				{ timeout: 180_000, intervals: [1000] }
			)
			.toBe(true);
		await settled(page);
		const misses: string[] = [];
		const decisions: string[] = [];
		let compared = 0;
		for (const fixture of fixtures.filter((f) => `${f.formula.document.folder}/${f.formula.document.file}` === name)) {
			const { pos, end } = await formulaAt(visual, fixture);
			expect(pos, `${fixture.id} is in the document`).toBeGreaterThanOrEqual(0);
			await page.evaluate((pos) => (window as unknown as { __canvasProbe: CanvasProbe }).__canvasProbe.active()!.select(pos), pos);
			await settled(page);
			const replay = new MathCaretReplay(page, fixture, pos, end);
			replay.check('arrow entry', (fixture.entries.arrowFromBefore ?? fixture.entries.arrowFromAfter).state, await replay.enter());
			await replay.sequences();
			await replay.vertical();
			await replay.grid(GRID_STRIDE);
			await replay.clickEntry();
			await page.keyboard.press('Escape');
			compared += replay.compared;
			misses.push(
				...replay.misses.map((miss) => `${fixture.id} ${miss}`).filter((row) => !KNOWN_DEVIATIONS.some((known) => known.test(row)))
			);
			decisions.push(...replay.decisionRows.map((row) => `${fixture.id} ${row}`));
		}
		await test.info().attach('decision rows', { body: decisions.join('\n'), contentType: 'text/plain' });
		await test.info().attach('misses', { body: misses.join('\n'), contentType: 'text/plain' });
		expect(
			texpile()
				.takeErrors()
				.filter((error) => !MISSING_FIGURE.test(error))
		).toEqual([]);
		expect(await probeErrors(page)).toEqual([]);
		expect(misses, `${misses.length} of ${compared} outcomes differ from P0`).toEqual([]);
	});
}
