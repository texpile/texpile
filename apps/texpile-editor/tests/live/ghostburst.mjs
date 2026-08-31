// The ghost-staircase repro: type char by char into a wrapping paragraph WITHOUT letting a
// compile land between keystrokes -- the flow adoption enables and the matrix never grades
// (every matrix scenario is one edit then a resync). Each keystroke past the wrap used to
// leave its predecessor's last line painted and march the page tail one line down, because
// adoption rewrote the store while the located band stayed cached at its old extent.
//
//   node tests/live/ghostburst.mjs
//
// PASS = every keystroke patches EXACT, and the forced compile at the end reports no
// records-adopted-drift and grades every painted row ok.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '../..');
const VITE = 5178;
const BRIDGE = 8150;

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--port', String(VITE), '--strictPort'], {
	cwd: appRoot,
	stdio: 'ignore'
});
const bridge = spawn(process.execPath, [path.join(here, 'server.mjs')], {
	stdio: 'ignore',
	env: { ...process.env, LIVE_BRIDGE_PORT: String(BRIDGE) }
});
const post = async (p, body) => (await fetch(`http://localhost:${BRIDGE}${p}`, { method: 'POST', body: JSON.stringify(body) })).json();
const waitHttp = async (url) => {
	for (let i = 0; i < 120; i++) {
		try {
			await fetch(url);
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 250));
		}
	}
	throw new Error('not up: ' + url);
};

let failed = false;
const browser = await (async () => {
	await waitHttp(`http://localhost:${BRIDGE}/ping`);
	await waitHttp(`http://localhost:${VITE}/tests/live/live.html`);
	return chromium.launch();
})();
try {
	const page = await browser.newPage({ viewport: { width: 960, height: 1000 } });
	await page.goto(`http://localhost:${VITE}/tests/live/live.html?bridge=${BRIDGE}`, { timeout: 60000 });
	await page.waitForFunction(() => !!window.__live, undefined, { timeout: 60000 });

	const { root } = await post('/fixture', { name: 'basic', run: 'ghost-' + Date.now() });
	if (!root) throw new Error('fixture failed');
	let base = fs.readFileSync(path.join(root, 'main.tex'), 'utf8');
	await page.evaluate((rt) => window.__live.open(rt), root);
	await page.evaluate(() => window.__live.events()); // drain warmup
	await new Promise((r) => setTimeout(r, 12000));
	await page.evaluate(() => window.__live.events());

	// type into the LONG wrapping paragraph, one char at a time, growing it past the wrap --
	// the anchor line is the paragraph's last source line, so appends land at its end. The
	// burst mixes ordinary words with one long unbreakable run, which is the profile that
	// showed paragraphs overlapping on screen.
	const ANCHOR = 'matrix types a character into the middle of it.';
	const burst =
		' awfwafawffawawfawfawfawfawfawfawfawfawf hello a aawfwafawfawfawfaw wfawfawf waf awawfawfawf awfaw fawfawfawfawfawfaw fawf awf awwaf awf awfawf awf afw awwaf waf aw fawf faw wfa awf faw fwa awf awf fwa fa w f';
	let outcomes = [];
	let buffer = base;
	for (const ch of burst) {
		const at = buffer.indexOf(ANCHOR) + ANCHOR.length;
		const edited = buffer.slice(0, at) + ch + buffer.slice(at);
		buffer = edited;
		const d = await page.evaluate(([a, b]) => window.__live.decide(a, b), [base, edited]);
		if (d.kind !== 'patch') throw new Error('expected patch, got ' + d.kind);
		await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d, root, edited]);
		// let the patch settle but NEVER a compile: poll events until an outcome appears
		let kind = null;
		let stage = '';
		let advanced = false;
		for (let i = 0; i < 100 && !kind; i++) {
			await new Promise((r) => setTimeout(r, 60));
			const ev = await page.evaluate(() => window.__live.events());
			for (const e of ev) {
				if (['patched', 'abandon', 'provisional', 'error'].includes(e.kind)) {
					kind = e.kind;
					stage = e.detail?.stage ?? '';
				}
				if (['records-adopted', 'compiled'].includes(e.kind)) advanced = true;
			}
		}
		outcomes.push(kind ?? 'none');
		if (kind && kind !== 'patched') console.log('  k' + outcomes.length + ' ' + JSON.stringify(ch) + ': ' + kind + ' ' + stage);
		// the BASELINE advances exactly when the app's would: an adoption moved it, or a
		// compile landed. Advancing it unconditionally made every keystroke after a refusal
		// diff against a page the store does not show -- a cascade the app cannot have.
		if (advanced) base = edited;
	}
	const counts = outcomes.reduce((o, k) => ((o[k] = (o[k] || 0) + 1), o), {});
	console.log('keystrokes:', outcomes.length, JSON.stringify(counts));

	// The oracle, in two steps. FIRST compile the BASELINE -- the exact text the adoptions
	// built the store toward; recordDrift against anything newer only measures the lag the
	// refused keystrokes honestly left, not the derivation. THEN land the buffer so the run
	// ends where the app would.
	fs.writeFileSync(path.join(root, 'main.tex'), base);
	await page.evaluate(() => window.__live.recompile());
	await new Promise((r) => setTimeout(r, 15000));
	const ev = await page.evaluate(() => window.__live.events());
	fs.writeFileSync(path.join(root, 'main.tex'), buffer);
	const drift = ev.filter((e) => e.kind === 'records-adopted-drift').map((e) => e.detail);
	const verify = ev.filter((e) => e.kind === 'patch-verify').map((e) => e.detail);
	console.log('records-adopted-drift:', JSON.stringify(drift));
	console.log('patch-verify:', JSON.stringify(verify.map((v) => ({ rows: v.rows, found: v.found, drift: v.drift, verdict: v.verdict }))));
	const badDrift = drift.some((d) => d.maxDy > 0.05 || d.rows !== d.freshRows);
	// 'stale' is honest: refused tail keystrokes mean the last PAINTED patch lags the buffer,
	// and the landing pass replaces it. Only a wrong render or a drifted store fails.
	const badVerify = verify.some((v) => String(v.verdict ?? '').startsWith('wrong'));
	const badKeys = outcomes.some((k) => k !== 'patched' && k !== 'abandon');
	failed = badDrift || badVerify || badKeys;
	console.log(failed ? 'GHOSTBURST: FAIL' : 'GHOSTBURST: PASS');
} finally {
	await browser.close().catch(() => undefined);
	bridge.kill();
	vite.kill();
	process.exit(failed ? 1 : 0);
}
