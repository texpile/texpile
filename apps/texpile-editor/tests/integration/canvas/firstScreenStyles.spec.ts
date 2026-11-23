// the style numbers on the 703 KB paper: the first screen's style resolution in each engine when opened again (the cold
// open is mostly V8 compiling the resolver, so it is logged), and no theme token read after the first frame
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, settled } from './canvasPage';

const DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';
const P2304 = path.join(DOCS, 'p2304/main.tex');
const BUDGET_MS: Record<string, number> = { chromium: 6, firefox: 12, webkit: 12 };
// the paper's figures point outside the folder the window has a copy of
const MISSING_FIGURE = /Failed to load resource: the server responded with a status of 40[34]/;

const SOURCE = fs.existsSync(P2304) ? fs.readFileSync(P2304, 'utf8') : '';
const texpile = useTexpile({ files: SOURCE ? { 'main.tex': SOURCE, 'again.tex': SOURCE } : {} });

test('p2304 opened again resolves its first screen within the budget and reads no theme token while scrolling', async ({ browserName }) => {
	test.skip(!fs.existsSync(P2304), `no ${P2304}`);
	test.setTimeout(240_000);
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('main.tex');
	await settled(visual.page);
	const first = await inCanvas(visual.page, ({ probe }) => probe.frameStats());
	console.log(
		`${browserName} p2304 cold first screen styles ${first.firstScreenStyleMs?.toFixed(2)} ms, theme reads ${first.themeReadMs.toFixed(2)} ms (${first.styleReads})`
	);
	for (const fraction of [0.25, 0.5, 0.75, 1]) {
		await inCanvas(
			visual.page,
			({ view }, at) => {
				const { scroller } = view.canvas;
				scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * at;
			},
			fraction
		);
		await settled(visual.page);
	}
	const scrolled = await inCanvas(visual.page, ({ probe }) => probe.frameStats());
	expect(
		texpile()
			.takeErrors()
			.filter((error) => !MISSING_FIGURE.test(error))
	).toEqual([]);
	expect(scrolled.styleReads, 'theme token reads after the first frame').toBe(first.styleReads);
	await visual.open('again.tex');
	await settled(visual.page);
	const again = await inCanvas(visual.page, ({ probe }) => probe.frameStats());
	console.log(`${browserName} p2304 opened again ${again.firstScreenStyleMs?.toFixed(2)} ms`);
	expect(again.firstScreenStyleMs).toBeLessThan(BUDGET_MS[browserName]);
});
