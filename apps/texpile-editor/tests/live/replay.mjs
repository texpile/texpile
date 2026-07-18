// Full-document typing replay: start from the preamble skeleton and TYPE the whole body
// through live mode -- prose in keystroke chunks, structural lines as atomic pastes --
// letting reconciles land naturally. The engine grades every patch against its own truth
// (patch-verify events); this driver reports the outcome histogram, every incorrect
// patch, and drift stats. Usage: node tests/live/replay.mjs [fixtureName]
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '../..');
const fixture = process.argv[2] || 'tut';

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

	const { root } = await post('/fixture', { name: fixture, run: 'replay' });
	const mainPath = path.join(root.replace(/\//g, path.sep), 'main.tex');
	const full = fs.readFileSync(mainPath, 'utf8');

	// split into preamble skeleton + body blocks (blank-line separated)
	const beginIdx = full.indexOf('\\begin{document}');
	const endIdx = full.indexOf('\\end{document}');
	const preamble = full.slice(0, beginIdx + '\\begin{document}'.length);
	const tail = full.slice(endIdx);
	const blocks = full
		.slice(beginIdx + '\\begin{document}'.length, endIdx)
		.split(/\n\s*\n/)
		.map((b) => b.trim())
		.filter(Boolean);
	console.log(`replaying ${blocks.length} blocks of ${fixture}`);

	let typed = ''; // body typed so far
	const bufferOf = (extra) => `${preamble}\n\n${typed}${extra ? extra + '\n\n' : ''}${tail}`;
	fs.writeFileSync(mainPath, bufferOf(''));
	await page.evaluate((r) => window.__live.open(r), root);
	await page.waitForFunction(() => (window.__draftEvents || []).some((e) => e.kind === 'compiled'), undefined, { timeout: 120000 });
	await page.waitForTimeout(3000);
	await page.evaluate(() => window.__live.events());

	let baseline = fs.readFileSync(mainPath, 'utf8');
	const allEv = [];
	const outcomes = {};
	const pump = async () => {
		const evs = await page.evaluate(() => window.__live.events());
		allEv.push(...evs);
		if (evs.some((e) => e.kind === 'compiled')) baseline = fs.readFileSync(mainPath, 'utf8');
	};
	const dispatch = async (buffer) => {
		const d = await page.evaluate(([a, b]) => window.__live.decide(a, b), [baseline, buffer]);
		let out = d.kind;
		if (d.kind === 'patch') {
			await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d, root, buffer]);
		} else if (d.kind === 'structural') {
			// the app debounces then full-passes; the replay does it right away
			fs.writeFileSync(mainPath, buffer);
			await page.evaluate(() => window.__live.recompile());
			out = 'structural:' + d.reason;
		}
		outcomes[out] = (outcomes[out] || 0) + 1;
		await pump();
		await new Promise((r) => setTimeout(r, 90));
	};

	const PROSE = /^[^\\]/; // blocks starting with a command/env paste atomically
	for (const [bi, block] of blocks.entries()) {
		if (PROSE.test(block) && block.length > 30) {
			// type the paragraph in keystroke chunks
			for (let i = 6; i < block.length; i += 6) await dispatch(bufferOf(block.slice(0, i)));
		}
		await dispatch(bufferOf(block)); // final/atomic form
		typed += block + '\n\n';
		if (bi % 4 === 3) {
			// pause like a human: let the reconcile land
			fs.writeFileSync(mainPath, bufferOf(''));
			await page.evaluate(() => window.__live.recompile());
			await page.waitForTimeout(2500);
			await pump();
			await page.screenshot({ path: path.join(here, 'results', `replay-${String(bi).padStart(2, '0')}.png`) });
		}
	}
	fs.writeFileSync(mainPath, bufferOf(''));
	await page.evaluate(() => window.__live.recompile());
	await page.waitForTimeout(5000);
	await pump();
	await page.screenshot({ path: path.join(here, 'results', 'replay-final.png') });

	const verifies = allEv.filter((e) => e.kind === 'patch-verify');
	const bad = verifies.filter((e) => e.detail.verdict === 'wrong');
	const drifts = verifies.map((e) => e.detail.drift).sort((a, b) => a - b);
	console.log('outcomes:', JSON.stringify(outcomes));
	console.log(
		`patch-verify: ${verifies.length} graded, ${bad.length} WRONG, ${verifies.filter((e) => e.detail.verdict === 'stale').length} stale, ${
			verifies.filter((e) => e.detail.verdict === 'unknown').length
		} unknown, drift p50=${drifts[Math.floor(drifts.length / 2)] ?? '-'} max=${drifts[drifts.length - 1] ?? '-'}`
	);
	for (const v of verifies) console.log(`  ${v.detail.ok ? 'ok ' : 'BAD'}:`, JSON.stringify(v.detail));
	const insEvs = allEv.filter((e) => e.kind === 'provisional-insert');
	for (const i of insEvs.slice(-6)) console.log('  ins:', JSON.stringify(i.detail));
	const compiles = allEv.filter((e) => e.kind === 'compiled');
	console.log(
		`compiles: ${compiles.length}, ms p50=${compiles.map((e) => e.detail.ms).sort((a, b) => a - b)[Math.floor(compiles.length / 2)] ?? '-'}`
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
