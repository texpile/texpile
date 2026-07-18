// Smoothness probe: type a NEW paragraph into the tutorial doc char-by-char (the exact
// user flow), dispatching through the real decision layer at keystroke pace, and capture
// frames DURING the burst plus after the reconcile settles. The frames are the oracle for
// flicker/jump: the insert band must hold one position, and the settle must be one swap.
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

	const { root } = await post('/fixture', { name: 'tut', run: 'burst' });
	const base = fs.readFileSync(path.join(root.replace(/\//g, path.sep), 'main.tex'), 'utf8');
	await page.evaluate((r) => window.__live.open(r), root);
	await page.waitForFunction(() => (window.__draftEvents || []).some((e) => e.kind === 'compiled'), undefined, { timeout: 120000 });
	await page.waitForTimeout(3500); // daemon warm + bases land
	await page.evaluate(() => window.__live.events());

	const TEXT = 'okay this is a brand new paragraph typed one key at a time.';
	const mark = '\\section{Switching';
	const lines = base.split('\n');
	const li = lines.findIndex((l) => l.includes(mark));
	const shots = [];
	for (let i = 3; i <= TEXT.length; i += 1) {
		const partial = [...lines.slice(0, li), TEXT.slice(0, i), '', ...lines.slice(li)].join('\n');
		const d = await page.evaluate(([a, b]) => window.__live.decide(a, b), [base, partial]);
		if (d.kind === 'patch') {
			await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d, root, partial]);
		} else {
			console.log(`char ${i}: decide=${d.kind}${d.kind === 'structural' ? ':' + d.reason : ''}`);
		}
		if (i === 6 || i === 24 || i === TEXT.length) {
			await page.waitForTimeout(120);
			const f = path.join(here, 'results', `burst-${String(i).padStart(2, '0')}.png`);
			await page.screenshot({ path: f, fullPage: false });
			shots.push(f);
		}
		await new Promise((r) => setTimeout(r, 110));
	}
	// second paragraph typed after the first (a k=2 joined run vs the stale baseline)
	const TEXT2 = 'and a second fresh paragraph follows it right away.';
	let full = [...lines.slice(0, li), TEXT, '', ...lines.slice(li)].join('\n');
	for (let i = 5; i <= TEXT2.length; i += 5) {
		const l2 = full.split('\n');
		const li2 = l2.findIndex((l) => l.includes(mark));
		const partial = [...l2.slice(0, li2), TEXT2.slice(0, i), '', ...l2.slice(li2)].join('\n');
		const d = await page.evaluate(([a, b]) => window.__live.decide(a, b), [base, partial]);
		if (d.kind === 'patch') {
			await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d, root, partial]);
		}
		await new Promise((r) => setTimeout(r, 110));
	}
	{
		const l2 = full.split('\n');
		const li2 = l2.findIndex((l) => l.includes(mark));
		full = [...l2.slice(0, li2), TEXT2, '', ...l2.slice(li2)].join('\n');
	}
	// pause -> reconcile -> settle
	await post('/write', { root, content: full });
	await page.waitForTimeout(4500);
	await page.screenshot({ path: path.join(here, 'results', 'burst-settled.png'), fullPage: false });
	const evs = await page.evaluate(() => window.__live.events());
	const counts = {};
	for (const e of evs) counts[e.kind] = (counts[e.kind] || 0) + 1;
	console.log('event counts:', JSON.stringify(counts));
	console.log(
		'inserts at:',
		JSON.stringify([...new Set(evs.filter((e) => e.kind === 'provisional-insert').map((e) => e.detail.at))])
	);
	for (const v of evs.filter((e) => e.kind === 'patch-verify')) console.log('verify:', JSON.stringify(v.detail));
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
