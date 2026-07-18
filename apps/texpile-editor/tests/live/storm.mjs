// Storm probe: the user's real junk-typing flow -- extend an existing paragraph, then open
// SEVERAL new paragraphs in a row at keystroke pace, letting reconciles land mid-burst.
// Frames every ~300ms; overlapping/duplicated text in any frame is the bug.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '../..');

const bridge = spawn(process.execPath, [path.join(here, 'server.mjs')], { stdio: 'inherit' });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--port', '5177', '--strictPort'], {
	cwd: appRoot,
	stdio: 'ignore'
});
const wait = async (url) => {
	for (let i = 0; i < 120; i++) {
		try {
			if ((await fetch(url)).status < 500) return;
		} catch {
			/* retry */
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('not up ' + url);
};
const post = async (p, body) => (await fetch(`http://localhost:8099${p}`, { method: 'POST', body: JSON.stringify(body) })).json();

try {
	await wait('http://localhost:8099/ping');
	await wait('http://localhost:5177/tests/live/live.html');
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 960, height: 1000 } });
	page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
	await page.goto('http://localhost:5177/tests/live/live.html');
	await page.waitForFunction(() => !!window.__live, undefined, { timeout: 60000 });

	const { root } = await post('/fixture', { name: 'tut', run: 'storm' });
	const mainPath = path.join(root.replace(/\//g, path.sep), 'main.tex');
	const base0 = fs.readFileSync(mainPath, 'utf8');
	await page.evaluate((r) => window.__live.open(r), root);
	await page.waitForFunction(() => (window.__draftEvents || []).some((e) => e.kind === 'compiled'), undefined, { timeout: 120000 });
	await page.waitForTimeout(3500);
	await page.evaluate(() => window.__live.events());

	// mimic the app faithfully: the DRIVER holds the live buffer; per keystroke it decides
	// vs the CURRENT baseline (which advances whenever a reconcile lands via /write+compile)
	let buffer = base0;
	let baseline = base0;
	const allEv = [];
	let shotN = 0;
	let lastShot = 0;
	const step = async (nextBuffer) => {
		buffer = nextBuffer;
		const d = await page.evaluate(([a, b]) => window.__live.decide(a, b), [baseline, buffer]);
		if (d.kind === 'patch') {
			await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d, root, buffer]);
		} else if (d.kind === 'structural') {
			// the app debounces a full pass 500ms after the last structural keystroke; the
			// storm approximates it by recompiling when the NEXT step sees the same state
			fs.writeFileSync(mainPath, buffer);
			await page.evaluate(() => window.__live.recompile());
		}
		// reconciles land asynchronously; when one lands, advance the baseline like onRec did
		const evs = await page.evaluate(() => window.__live.events());
		allEv.push(...evs);
		if (evs.some((e) => e.kind === 'compiled')) baseline = fs.readFileSync(mainPath, 'utf8');
		if (Date.now() - lastShot > 300) {
			lastShot = Date.now();
			await page.screenshot({ path: path.join(here, 'results', `storm-${String(shotN++).padStart(2, '0')}.png`), fullPage: false });
		}
		await new Promise((r) => setTimeout(r, 100));
	};

	// phase 1: extend the intro paragraph (patch path)
	const target = 'basics to get you started.';
	for (let i = 4; i <= 40; i += 4) {
		const junk = ' waawfwaf awwfawfawfawf'.slice(0, i);
		await step(buffer.replace(target, target + junk));
	}
	// phase 2..4: three new junk paragraphs, each typed progressively IN PLACE before
	// \section{Switching (splice against the paragraph-start snapshot, not the mutated
	// buffer, or every chunk becomes an extra paragraph)
	const mark = '\\section{Switching';
	for (let p = 0; p < 3; p++) {
		const junkWord = ['wafawfawfawfawffawfwafawfawf', 'awfwafawfawfawawfwafawfwawfawf', 'awfawfawfawfawfawf'][p];
		const cur = buffer;
		for (let i = 3; i <= junkWord.length; i += 3) {
			const lines = cur.split('\n');
			const li = lines.findIndex((l) => l.includes(mark));
			const partial = [...lines.slice(0, li), junkWord.slice(0, i), '', ...lines.slice(li)].join('\n');
			await step(partial);
		}
	}
	// pause: let everything settle
	fs.writeFileSync(mainPath, buffer);
	await page.evaluate(() => window.__live.recompile());
	await page.waitForTimeout(5000);
	await page.screenshot({ path: path.join(here, 'results', 'storm-settled.png'), fullPage: false });
	const counts = {};
	for (const e of allEv) counts[e.kind] = (counts[e.kind] || 0) + 1;
	console.log('event counts:', JSON.stringify(counts));
	for (const v of allEv.filter((e) => e.kind === 'patch-verify')) console.log('verify:', JSON.stringify(v.detail));
	console.log('frames:', shotN);
	console.log(
		'insert positions:',
		JSON.stringify([...new Set(allEv.filter((e) => e.kind === 'provisional-insert').map((e) => e.detail.at))])
	);
	await browser.close();
} finally {
	bridge.kill();
	vite.kill();
	for (const im of ['lualatex.exe', 'luatex.exe'])
		try {
			execSync(`taskkill /F /IM ${im} /T`, { stdio: 'ignore' });
		} catch {
			/* none */
		}
}
