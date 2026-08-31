// Parallel live-mode matrix: same measurement as matrix-bert.mjs, sharded across N
// isolated worker chains. Each worker owns a bridge process (its own engine + daemon),
// a browser page paired to it via ?bridge=<port>, and a private fixture copy -- workers
// pull scenarios from one shared queue, so nothing is serialized except the queue index.
// One vite serves all pages (it is stateless).
//
// Run from apps/texpile-editor:
//   node tests/live/matrix-par.mjs [--scenarios=bert-scenarios.mjs] [--workers=6]
//                                  [--only=fixture[:scenario]]
// MATRIX_PICK=name1,name2 limits to those scenarios (targeted re-verification).
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { classify, collectUntilQuiet } from './lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(appRoot, '../..');
const VITE = 5177;
const BRIDGE0 = 8110; // 8099 stays free for the sequential runners

const arg = (k, d) => {
	const a = process.argv.find((x) => x.startsWith(`--${k}=`));
	return a ? a.slice(k.length + 3) : d;
};
const scenarioMod = arg('scenarios', 'bert-scenarios.mjs');
const WORKERS = Math.max(1, Number(arg('workers', '6')));
const only = arg('only', '');
const [onlyFixture, onlyScenario] = only ? only.split(':') : [null, null];
const pick = new Set((process.env.MATRIX_PICK || '').split(',').filter(Boolean));

const { FIXTURES, applyOp } = await import('./' + scenarioMod);

if (!fs.existsSync(path.join(repoRoot, 'electron/dist/draft/draftService.js'))) {
	console.error('electron/dist modules missing - run pnpm electron:build first');
	process.exit(1);
}

const work = [];
for (const fx of FIXTURES) {
	if (onlyFixture && fx.name !== onlyFixture) continue;
	for (const sc of fx.scenarios) {
		if (onlyScenario && sc.name !== onlyScenario) continue;
		if (pick.size && !pick.has(sc.name)) continue;
		work.push({ fx, sc });
	}
}
console.log(`${work.length} scenarios across ${WORKERS} workers (${scenarioMod})`);

const waitHttp = async (url, tries = 120) => {
	for (let i = 0; i < tries; i++) {
		try {
			const r = await fetch(url);
			if (r.status < 500) return;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('not up: ' + url);
};

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'dev', '--port', String(VITE), '--strictPort'], {
	cwd: appRoot,
	stdio: 'ignore'
});
const bridges = Array.from({ length: WORKERS }, (_, i) =>
	spawn(process.execPath, [path.join(here, 'server.mjs')], {
		stdio: 'inherit',
		env: { ...process.env, LIVE_BRIDGE_PORT: String(BRIDGE0 + i) }
	})
);
const killEngines = () => {
	for (const im of ['lualatex.exe', 'luatex.exe'])
		try {
			execSync(`taskkill /F /IM ${im} /T`, { stdio: 'ignore' });
		} catch {
			/* none */
		}
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const rows = [];
const jsonl = path.join(here, 'results', `matrix-${stamp}.jsonl`);
fs.mkdirSync(path.join(here, 'results'), { recursive: true });
const pushRow = (r) => {
	rows.push(r);
	fs.appendFileSync(jsonl, JSON.stringify(r) + '\n');
};

let next = 0; // shared queue cursor: workers race on it, single process so no locking

async function runWorker(w) {
	const port = BRIDGE0 + w;
	const post = async (p, body) => (await fetch(`http://localhost:${port}${p}`, { method: 'POST', body: JSON.stringify(body) })).json();
	await waitHttp(`http://localhost:${port}/ping`);
	const pageUrl = `http://localhost:${VITE}/tests/live/live.html?bridge=${port}`;
	// browser PER WORKER: a chromium crash under memory pressure must not cascade into
	// the other five workers' pages
	let browser = await chromium.launch();
	let page = await browser.newPage({ viewport: { width: 960, height: 1000 } });
	page.on('pageerror', (e) => console.log(`[w${w} pageerror]`, String(e).slice(0, 200)));
	await page.goto(pageUrl, { timeout: 60000 });
	await page.waitForFunction(() => !!window.__live, undefined, { timeout: 60000 });

	let curFxName = null;
	let root = null;
	let base = null;
	// the fixture as opened. Every scenario is reset to this, so a row reproduces on its own
	// instead of only together with the rows that happened to run before it in this worker.
	let pristine = null;
	let openSeq = 0;
	// worker body wrapped so the browser ALWAYS closes: a leaked chromium connection
	// keeps node alive after the run ends
	try {
		const openFixture = async (fx) => {
			// fresh dir every open: after a page death the old root's engine may still hold
			// Windows file locks, so never delete it -- just leave it behind
			const r = await post('/fixture', { name: fx.name, run: `${stamp}-w${w}-${openSeq++}` });
			if (!r.root) throw new Error('fixture failed: ' + (r.error ?? 'no root'));
			root = r.root;
			base = fs.readFileSync(path.join(root, 'main.tex'), 'utf8');
			pristine = base;
			await page.evaluate((rt) => window.__live.open(rt), root);
			const ev0 = await collectUntilQuiet(page, { quietMs: 1500, maxMs: Math.max(90000, (fx.settleMs ?? 0) * 2) });
			if (!ev0.some((e) => e.kind === 'compiled')) console.log(`  [w${w}] warmup compile not observed`, ev0.map((e) => e.kind).join(' '));
			curFxName = fx.name;
		};
		const rebootPage = async () => {
			try {
				await page.close();
				page = await browser.newPage({ viewport: { width: 960, height: 1000 } });
			} catch {
				// the whole browser is gone: relaunch it (worker-private, nobody else affected)
				await browser.close().catch(() => {});
				browser = await chromium.launch();
				page = await browser.newPage({ viewport: { width: 960, height: 1000 } });
			}
			await page.goto(pageUrl, { timeout: 60000 });
			await page.waitForFunction(() => !!window.__live, undefined, { timeout: 60000 });
			curFxName = null; // force a fresh fixture open (the old root's baseline is unknown now)
		};

		for (;;) {
			const i = next++;
			if (i >= work.length) break;
			const { fx, sc } = work[i];
			for (let attempt = 0; ; attempt++) {
				try {
					if (curFxName !== fx.name) await openFixture(fx);
					let pre = base;
					if (sc.preOp) {
						// a prior edit whose patch left the baseline behind (the app's normal state
						// mid-writing); dispatch it and discard its events
						pre = applyOp(base, { ...sc, anchor: sc.preAnchor ?? sc.anchor, op: sc.preOp, line: undefined });
						if (pre === null) pre = base;
						else {
							const dp = await page.evaluate(([a, b]) => window.__live.decide(a, b), [base, pre]);
							if (dp.kind === 'patch') {
								await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [dp, root, pre]);
								const evPre = await collectUntilQuiet(page, { maxMs: 12000 });
								if (evPre.some((e) => e.kind === 'compiled')) base = fs.readFileSync(path.join(root, 'main.tex'), 'utf8');
							}
						}
					}
					const edited = applyOp(pre, sc);
					if (edited === null) {
						pushRow({ fixture: fx.name, ...sc, outcome: 'ANCHOR-MISSING', latencyMs: null, reasons: [] });
						console.log(`  [w${w}] ${sc.name}: ANCHOR-MISSING`);
						break;
					}
					const d = await page.evaluate(([a, b]) => window.__live.decide(a, b), [base, edited]);
					let res;
					if (d.kind === 'noop') res = { outcome: 'NOOP', latencyMs: 0, reasons: [] };
					else if (d.kind === 'skip-unbalanced') res = { outcome: 'HOLD', latencyMs: null, reasons: ['skip-unbalanced'] };
					else if (d.kind === 'boundary' || d.kind === 'env-body') {
						await post('/write', { root, content: edited });
						await page.evaluate(() => window.__live.recompile());
						const ev = await collectUntilQuiet(page, { maxMs: sc.maxMs ?? 16000 });
						const c = classify(ev);
						res = {
							outcome: 'RECOMPILE',
							latencyMs: c.latencyMs,
							reasons: [d.kind === 'env-body' ? 'env-body:' + d.env : 'boundary-line']
						};
					} else if (d.kind === 'structural') {
						res = { outcome: 'RECOMPILE', latencyMs: null, reasons: [d.reason] };
						await post('/write', { root, content: edited });
						await page.evaluate(() => window.__live.recompile());
						await collectUntilQuiet(page, { maxMs: 20000 });
					} else {
						await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d, root, edited]);
						let ev = await collectUntilQuiet(page, { maxMs: sc.maxMs ?? 12000 });
						for (let retry = 0; retry < 2 && !ev.length; retry++) {
							// straggler race (a late compile settling as we dispatched): retry patiently
							await new Promise((r) => setTimeout(r, 1500 + retry * 2500));
							await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d, root, edited]);
							ev = await collectUntilQuiet(page, { maxMs: sc.maxMs ?? 12000 });
						}
						if (sc.thenOp) {
							const edited2 = applyOp(edited, { ...sc, op: sc.thenOp });
							if (edited2 !== null) {
								const d2 = await page.evaluate(([a, b]) => window.__live.decide(a, b), [base, edited2]);
								if (d2.kind === 'patch') {
									await page.evaluate(([req, r, buf]) => window.__live.patch(req, r, buf), [d2, root, edited2]);
									ev = ev.concat(await collectUntilQuiet(page, { maxMs: sc.maxMs ?? 12000 }));
								}
							}
						}
						res = classify(ev);
						let pv = ev.filter((e) => e.kind === 'patch-verify').map((e) => e.detail);
						// A patch that adopted its own records schedules NO compile, and patch-verify
						// only runs when one lands -- so the better the exact path works, the LESS of
						// it gets graded. Measured before this: 15 of 116 EXACT rows checked, the
						// other 101 seen by nothing at all. Force the pass on the EDITED source
						// purely to obtain the comparison. `res.outcome` was classified above and is
						// untouched, and the app itself is unchanged: this is the harness paying for
						// its own oracle rather than production compiling when it need not.
						if (!pv.length && res.outcome === 'EXACT') {
							await post('/write', { root, content: edited });
							await page.evaluate(() => window.__live.recompile());
							const evV = await collectUntilQuiet(page, { quietMs: 1200, maxMs: fx.settleMs ?? 25000 });
							pv = evV.filter((e) => e.kind === 'patch-verify').map((e) => e.detail);
							// an adopted record store disagreeing with the engine's own is a SEPARATE
							// defect from a mispainted row, and this is the only pass that can see it
							const dr = evV.filter((e) => e.kind === 'records-adopted-drift').map((e) => e.detail);
							if (dr.length) res.drift = dr;
							res.forced = true;
						}
						if (pv.length) res.verify = pv;
						// every hop's landing derivation, so a row that verifies wrong carries the
						// numbers that placed it instead of needing its own re-run
						const hops = ev.filter((e) => e.kind === 'chain-hop').map((e) => e.detail);
						if (hops.length) res.hops = hops;
						// the edited column's own geometry, so a tint bucket can be attributed
						const pc = ev.filter((e) => e.kind === 'provisional' && e.detail?.col).map((e) => e.detail.col);
						if (pc.length) res.col = pc[pc.length - 1];
						// what the certificate proved, including how far it needed content ABOVE the
						// band moved -- the one number that decides certExact on a fitting page
						const certEv = ev.filter((e) => e.kind === 'skel-certified').map((e) => e.detail);
						if (certEv.length) res.cert = certEv[certEv.length - 1];
						if (d.transient && res.outcome === 'NOFEEDBACK') res.outcome = 'TRANSIENT';
					}
					const ceilOk = sc.expect.includes(res.outcome);
					console.log(
						`  [w${w}] ${sc.name}: ${res.outcome}${res.latencyMs != null ? ` ${res.latencyMs}ms` : ''} ${ceilOk ? 'AT-CEILING' : `(ceiling ${sc.expect.join('|')})`} ${res.reasons.join(',')}`
					);
					pushRow({ fixture: fx.name, ...sc, ...res });
					// RESET, not advance. Scenarios used to run against whatever the previous ones
					// left behind, so two runs of the same file were not the same test -- only
					// aggregates could be compared, and any-WRONG swung 42-81 on identical input.
					// From the pristine source every row stands alone and run A diffs against run
					// B row by row. The compile still has to LAND before the next scenario: one
					// arriving mid-dispatch bails 'compiling' and measures nothing, which is what
					// settleMs is for.
					base = pristine;
					await post('/write', { root, content: base });
					await page.evaluate(() => window.__live.recompile());
					await collectUntilQuiet(page, { quietMs: 1200, maxMs: fx.settleMs ?? 25000 });
					break;
				} catch (e) {
					// the harness page occasionally dies under memory pressure; reboot and retry once
					if (attempt >= 1 || !/context was destroyed|Target.*closed|has been closed/i.test(String(e))) throw e;
					console.log(`  [w${w}] page died on ${sc.name}; rebooting and retrying`);
					await rebootPage();
				}
			}
		}
		await post('/stop', {});
	} finally {
		await browser.close().catch(() => {});
	}
}

try {
	await waitHttp(`http://localhost:${VITE}/tests/live/live.html`);
	// a worker dying unrecoverably loses only its in-flight scenario; the rest finish
	await Promise.all(
		Array.from({ length: WORKERS }, (_, w) => runWorker(w).catch((e) => console.log(`[w${w}] worker died:`, String(e).slice(0, 300))))
	);
} finally {
	for (const b of bridges) b.kill();
	vite.kill();
	killEngines();
}

const md = [
	`# Live-mode edit-class matrix (parallel x${WORKERS}) - ${stamp}`,
	'',
	'| Fixture | Scenario | Outcome | Latency | Ceiling | At ceiling | Reasons |',
	'|---|---|---|---|---|---|---|',
	...rows.map(
		(r) =>
			`| ${r.fixture} | ${r.name} | ${r.outcome} | ${r.latencyMs != null ? r.latencyMs + 'ms' : '-'} | ${(r.expect || []).join('/')} | ${
				(r.expect || []).includes(r.outcome) ? 'yes' : 'NO'
			} | ${(r.reasons || []).join(', ')} |`
	),
	'',
	`At ceiling: ${rows.filter((r) => (r.expect || []).includes(r.outcome)).length}/${rows.length}`
].join('\n');
fs.writeFileSync(path.join(here, 'results', `matrix-${stamp}.md`), md);
console.log('\n' + md.split('\n').slice(-3).join('\n'));
console.log(`written to tests/live/results/matrix-${stamp}.md`);
process.exit(0); // any leaked child connection must not hold the run open
