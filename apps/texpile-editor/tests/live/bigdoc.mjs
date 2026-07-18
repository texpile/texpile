// Big-document probe for viewport windowing: open the 907-page GR book through the
// harness, measure compile->paint wall time, count PAINTED canvases (must be ~window
// size, not page count), jump deep into the book, and verify pages paint on entry.
// Run: node tests/live/bigdoc.mjs <bookRoot> <mainFile>
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '../..');
const srcRoot = process.argv[2] || 'C:/dev/texpile-corpus/1711.07597';
const mainFile = process.argv[3] || 'main.tex';

// copy to a work dir with the expected main name
const work = path.join(os.tmpdir(), 'texpile-bigdoc');
fs.rmSync(work, { recursive: true, force: true });
fs.cpSync(srcRoot, work, { recursive: true });
if (mainFile !== 'main.tex') fs.copyFileSync(path.join(work, mainFile), path.join(work, 'main.tex'));

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

try {
	await wait('http://localhost:8099/ping');
	await wait('http://localhost:5177/tests/live/live.html');
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 960, height: 1000 } });
	page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
	await page.goto('http://localhost:5177/tests/live/live.html');
	await page.waitForFunction(() => !!window.__live, undefined, { timeout: 60000 });
	// main-thread responsiveness: record every long task (>50ms) from here on
	await page.evaluate(() => {
		window.__longTasks = [];
		new PerformanceObserver((l) => {
			for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration));
		}).observe({ entryTypes: ['longtask'] });
	});

	const t0 = Date.now();
	await page.evaluate((r) => window.__live.open(r), work.replace(/\\/g, '/'));
	// wait for the compile to land (book takes ~1-2 min for 2 passes)
	await page.waitForFunction(() => (window.__draftEvents || []).some((e) => e.kind === 'compiled'), undefined, { timeout: 400000 });
	const compiled = await page.evaluate(() => (window.__draftEvents || []).find((e) => e.kind === 'compiled'));
	console.log(`compiled: ${JSON.stringify(compiled.detail)} wall=${Date.now() - t0}ms`);
	await page.waitForTimeout(2500);

	const stats = () =>
		page.evaluate(() => {
			const cvs = [...document.querySelectorAll('canvas')];
			const idx = cvs.map((c, i) => (c.width > 0 ? i + 1 : null)).filter(Boolean);
			return { canvases: cvs.length, painted: idx.length, first: idx.slice(0, 8), last: idx.slice(-4) };
		});
	const winEvents = await page.evaluate(() => (window.__draftEvents || []).filter((e) => e.kind === 'window').slice(-4));
	console.log('window events:', JSON.stringify(winEvents));
	console.log('after compile:', JSON.stringify(await stats()));
	console.log('long tasks (ms):', JSON.stringify(await page.evaluate(() => (window.__longTasks || []).splice(0))));

	// jump deep
	const t1 = Date.now();
	await page.evaluate(() => {
		const sc = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight * 5 && d.clientHeight > 300);
		if (sc) sc.scrollTop = sc.scrollHeight * 0.45;
	});
	await page.waitForTimeout(1200);
	console.log(`after deep scroll (${Date.now() - t1}ms):`, JSON.stringify(await stats()));
	await page.screenshot({ path: path.join(here, 'results', 'bigdoc-deep.png') });

	await page.evaluate(() => {
		const sc = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight * 5 && d.clientHeight > 300);
		if (sc) sc.scrollTop = 0;
	});
	await page.waitForTimeout(1200);
	console.log('back to top:', JSON.stringify(await stats()));
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
