// Teleport exactness on one folder: a recording pass, then one served teleport per chosen point, whose shipped
// pages must equal the recording pass's own, record for record.
//   node tests/live/teleport/check.mjs <folder> <main.tex> [--max=8] [--json=out.json]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, '../../../../../electron/lua').replace(/\\/g, '/');
const [srcDir, main] = process.argv.slice(2);
const flag = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const max = Number(flag('max', 8));
const jsonOut = flag('json', '');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tele-'));
fs.cpSync(srcDir, root, { recursive: true });

const SHIM = '\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi';
function job(out, wait) {
	const setup =
		`\\directlua{TEXPILE_ENGINE_DIR='${engineDir}'; TEXPILE_DRAFT_OUT='${out}'; TEXPILE_TELE_OUT='${out}/tele'; ` +
		`TEXPILE_TELE_WAIT=${wait}; ${flag('dense', '') ? 'TEXPILE_TELE_DENSE=true; TEXPILE_TELE_SHARE=1e9; ' : ''}${process.env.TELE_PROF ? 'TEXPILE_TELE_PROF=true; ' : ''}dofile('${engineDir}/page-extract.lua'); dofile('${engineDir}/teleport/teleport.lua')}`;
	const hooks =
		`\\AtBeginDocument{\\directlua{texpile_begindoc(\\the\\inputlineno)}\\input{${out}/texpile-hooks.tex}` +
		`\\AddToHook{shipout/before}{\\directlua{page_extract(\\the\\ShipoutBox)}}\\AtEndDocument{\\directlua{page_extract_finish()}}}` +
		`\\AddToHook{begindocument/end}{\\directlua{texpile_tele_begin_end()}}`;
	return `${setup}${hooks}${SHIM}\\input{${main}}`;
}
function prepare(out) {
	const abs = path.join(root, out);
	fs.rmSync(abs, { recursive: true, force: true });
	fs.mkdirSync(path.join(abs, 'tele'), { recursive: true });
	fs.writeFileSync(
		path.join(abs, 'texpile-hooks.tex'),
		'\\AddToHook{para/begin}{\\directlua{texpile_para()}}\n\\AddToHook{para/end}{\\directlua{texpile_para_end()}}\n'
	);
	for (const d of fs.readdirSync(root, { withFileTypes: true }))
		if (d.isDirectory() && d.name !== '_draft') fs.mkdirSync(path.join(abs, d.name), { recursive: true });
	return abs;
}
function start(out, wait) {
	return spawn('lualatex', ['-no-shell-escape', '-interaction=nonstopmode', `-output-directory=${out}`, '-jobname=draft', job(out, wait)], {
		cwd: root,
		env: { ...process.env, max_print_line: '100000' }
	});
}
function finished(child) {
	return new Promise((resolve) => child.on('exit', (code) => resolve(code)));
}

function pageOf(dir, n) {
	const p = path.join(root, dir, `page-${String(n).padStart(3, '0')}.jsonl`);
	if (!fs.existsSync(p)) return null;
	const recs = fs
		.readFileSync(p, 'utf8')
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const fonts = new Map(recs.filter((r) => r.t === 'font').map((r) => [r.id, `${r.file}@${r.size}`]));
	return recs.filter((r) => r.t !== 'font').map((r) => JSON.stringify(r.f !== undefined ? { ...r, f: fonts.get(r.f) } : r));
}
function samePage(a, b) {
	if (!a || !b) return { ok: false, why: a ? 'missing in teleport' : 'missing in reference' };
	for (let i = 0; i < Math.max(a.length, b.length); i++)
		if (a[i] !== b[i]) return { ok: false, at: i, ref: a[i]?.slice(0, 160), got: b[i]?.slice(0, 160) };
	return { ok: true };
}

// the recording pass, after a first pass wrote the aux, toc and the rest it reads back
const recDir = '_draft/rec';
prepare(recDir);
await finished(start(recDir, false));
const SEEDS = /^draft\.(aux|toc|lof|lot|bbl|out|nav|snm|bcf|run\.xml)$/;
const seedDir = path.join(root, '_draft/seed');
fs.mkdirSync(seedDir, { recursive: true });
for (const f of fs.readdirSync(path.join(root, recDir)))
	if (SEEDS.test(f)) fs.copyFileSync(path.join(root, recDir, f), path.join(seedDir, f));
const t0 = performance.now();
const rec = start(recDir, false);
let recLog = '';
rec.stdout.on('data', (d) => (recLog += d));
await finished(rec);
const recMs = Math.round(performance.now() - t0);
for (const l of recLog.split('\n')) if (l.startsWith('@@TELE PROF')) console.error('  ' + l);
const manifest = JSON.parse(fs.readFileSync(path.join(root, recDir, 'pages.json'), 'utf8'));
const index = fs
	.readFileSync(path.join(root, recDir, 'tele', 'index.jsonl'), 'utf8')
	.split('\n')
	.filter(Boolean)
	.map((l) => JSON.parse(l));
const keyOf = (st) => st.map(([f, l]) => `${f}:${l}`).join('>');
const byKey = new Map(index.map((p) => [keyOf(p.stack), p]));

// a point inside a nested file is entered through the points before each line that opened a file
function chainFor(p) {
	const chain = [];
	for (let j = 1; j < p.stack.length; j++) {
		const outer = byKey.get(keyOf(p.stack.slice(0, j)));
		if (!outer || outer.refuse) return null;
		chain.push(outer);
	}
	chain.push(p);
	return chain;
}
const only = flag('only', '');
if (flag('recordonly', '')) {
	console.log(JSON.stringify({ pages: manifest.count, recMs, points: index.length }));
	process.exit(0);
}
const usable = index.filter((p) => !p.refuse && chainFor(p) && (!only || keyOf(p.stack) === only));
const pick = [
	...new Set(
		Array.from({ length: Math.min(max, usable.length) }, (_, i) => usable[Math.floor((i * usable.length) / Math.min(max, usable.length))])
	)
];

const lua = (v) =>
	JSON.stringify(v)
		.replace(/\[/g, '{')
		.replace(/\]/g, '}')
		.replace(/"(\w+)":/g, '$1=');
const results = [];
for (const [k, p] of pick.entries()) {
	const out = `_draft/s${k}`;
	const abs = prepare(out);
	for (const f of fs.readdirSync(seedDir)) fs.copyFileSync(path.join(seedDir, f), path.join(abs, f));
	const chain = chainFor(p).map((c) => ({ rec: c.file, stack: c.stack.map(([f, l]) => ({ f, l })) }));
	const stops = index.filter((q) => q.id > p.id).map((q) => ({ rec: q.file, stack: q.stack.map(([f, l]) => ({ f, l })) }));
	fs.writeFileSync(path.join(abs, 'plan.lua'), `return ${lua({ chain, stops, selfcheck: !!process.env.TELE_SELF })}\n`);
	const child = start(out, true);
	const lines = [];
	let applied = null;
	let stop = null;
	let refused = null;
	const pages = [];
	const t1 = performance.now();
	readline.createInterface({ input: child.stdout }).on('line', (l) => {
		const m = l.match(/^@@TELE (\w+) ?(.*)$/);
		if (!m) return;
		lines.push(l);
		if (m[1] === 'READY') child.stdin.write(`TELE ${out}/plan.lua\n`);
		else if (m[1] === 'APPLIED') applied = { ms: Number(m[2]), at: performance.now() - t1 };
		else if (m[1] === 'PAGE') pages.push(Number(m[2].split(' ')[0]));
		else if (m[1] === 'STOP') stop = Number(m[2]);
		else if (m[1] === 'REFUSED') refused = m[2];
		else if (m[1] === 'SELF') console.error('    SELF ' + m[2].slice(0, 900));
	});
	const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
	await finished(child);
	clearTimeout(timer);
	const last = stop ?? manifest.count;
	let bad = null;
	if (!refused)
		for (let n = p.shipped + 1; n <= last; n++) {
			const c = samePage(pageOf(recDir, n), pageOf(out, n));
			if (!c.ok) {
				bad = { page: n, ...c };
				break;
			}
		}
	const outcome = refused ? 'REFUSED' : !applied ? 'NO-APPLY' : bad ? 'WRONG' : 'EXACT';
	const r = {
		id: p.id,
		at: keyOf(p.stack),
		shipped: p.shipped,
		chain: chain.length,
		outcome,
		applyMs: applied?.ms,
		pagesShipped: pages.length,
		stoppedAfter: stop,
		refused,
		bad
	};
	results.push(r);
	console.error(
		`  ${r.at} (after ${p.shipped} pages, chain ${chain.length}): ${outcome}${refused ? ' ' + refused : ''}${bad ? ' ' + JSON.stringify(bad).slice(0, 300) : ''} apply ${applied?.ms ?? '-'} ms, stop ${stop ?? 'none'}, ${pages.length} pages`
	);
}
const summary = {
	folder: srcDir,
	main,
	pages: manifest.count,
	recMs,
	points: index.length,
	checked: results.length,
	exact: results.filter((r) => r.outcome === 'EXACT').length,
	results
};
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, results: undefined }));
if (!process.env.TELE_KEEP) fs.rmSync(root, { recursive: true, force: true });
else console.error('kept ' + root);
