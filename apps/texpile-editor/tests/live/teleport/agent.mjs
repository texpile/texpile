// The live gate for agent edits: a compile, then writes as an agent makes them, each landing on disk whole and sent
// through the executor as the app sends a changed file. A write holds 2 to 5 hunks anywhere in a file; some go to two
// or three files a moment apart, some land while the previous teleport or a compile still runs, some come half done
// first and whole 100 to 500 ms later, some are taken back but for their last hunk, and some change the preamble. Once a write settles, the pages on screen must
// equal a fresh run of the text the app shows, and the compile the app then runs must equal a fresh run of disk.
//   node tests/live/teleport/agent.mjs <folder> <main.tex> [--writes=8] [--seed=1] [--kinds=multi,files,...] [--json=out.json]
// Exit 0 when every page was right, 1 on a wrong or stale page, 3 when the folder does not compile.
import fs from 'node:fs';
import path from 'node:path';
import { Gate, flags, seeded, sleep } from './gate.mjs';
import { agentWrite, applyHunks, brokenText, refsOf } from './agentHunks.mjs';

const KINDS = ['multi', 'files', 'overlap', 'compile', 'broken', 'revise', 'preamble'];
const [srcDir, mainFile] = process.argv.slice(2);
const flag = flags(process.argv);
const writes = Number(flag('writes', 8));
const seed = Number(flag('seed', 1));
const kinds = flag('kinds', KINDS.join(',')).split(',');
const jsonOut = flag('json', '');
const dumpDir = flag('dump', '');
const rand = seeded(seed);
const pick = (a) => a[rand(a.length)];

const t0 = Date.now();
const { gate: g, compiled } = await Gate.open(srcDir, mainFile, { band: process.argv.includes('--band'), dump: dumpDir });
if (!g) {
	console.log(
		JSON.stringify({ folder: srcDir, main: mainFile, outcome: 'no-compile', error: compiled.error?.slice(0, 200), file: compiled.file })
	);
	process.exit(3);
}
const compileMs = Date.now() - t0;
const { texts, shownTexts } = g;
let texErrors = 0;
try {
	texErrors = fs.readFileSync(path.join(g.root, '_draft', 'draft.log'), 'latin1').match(/^! /gm)?.length ?? 0;
} catch {
	/* no log */
}
// the files the document reads, as the compile's engine kept them (page-extract's own list has base names only)
const read = new Set();
for (const p of fs.readdirSync(path.join(g.root, '_draft'))) {
	const src = path.join(g.root, '_draft', p, 'tele', 'src');
	if (fs.existsSync(src)) for (const f of fs.readdirSync(src, { recursive: true })) read.add(f.replace(/\\/g, '/'));
}
const docFiles = g.files.filter((f) => f === mainFile || read.has(f));

// the compile in flight as the app's compiler sees it: an edit finding no index waits for it
let compiling = null;
let lastCompileMs = Math.max(1000, compileMs - 4000);
function compileNow() {
	const t = Date.now();
	const p = g.compileSaved();
	compiling = p;
	void p.finally(() => {
		lastCompileMs = Date.now() - t;
		if (compiling === p) compiling = null;
	});
	return p;
}

function write(file, text) {
	texts.set(file, text);
	fs.writeFileSync(path.join(g.root, file), text);
}

/** DraftTeleport.edit: what the app makes of a teleport's result */
const newest = new Map();
async function appEdit(file, text) {
	const mine = {};
	newest.set(file, mine);
	const sent = g.send(file, text);
	const r = await sent.landed;
	if (!r.ok && r.reason === 'no-index' && compiling) {
		await compiling;
		return appEdit(file, text);
	}
	if (!r.ok && r.reason === 'replaced') {
		if (newest.get(file) !== mine) return { file, text, outcome: 'none', reason: 'replaced by a newer edit' };
		await compiling;
		return appEdit(file, text);
	}
	const outcome = r.ok ? 'shown' : r.reason === 'held' ? 'held' : ['superseded', 'outside'].includes(r.reason) ? 'none' : 'compile';
	return { file, text, outcome, reason: r.ok ? `${r.ms} ms` : `${r.reason}${r.detail ? ' ' + r.detail : ''}` };
}

const refCache = new Map();
function refOf(m) {
	const key = JSON.stringify([g.seedDir, [...m]]);
	if (!refCache.has(key)) {
		if (refCache.size > 3) refCache.delete(refCache.keys().next().value);
		refCache.set(key, g.reference(m));
	}
	return refCache.get(key);
}

let n = 0;
/** a write the document still compiles with, so a wrong page is the preview's and not the write's */
function planWrite(file, preamble = false) {
	if (!texts.has(file)) return null;
	const refs = refsOf([...texts.values()]);
	for (let tries = 0; tries < 4; tries++) {
		const w = agentWrite(texts.get(file), file === mainFile, rand, ++n, refs, preamble);
		if (!w) return null;
		const m = new Map(texts).set(file, w.text);
		if (refOf(m)) return { file, ...w };
	}
	return null;
}

async function runKind(kind) {
	const others = docFiles.filter((f) => f !== mainFile);
	if (kind === 'files' && docFiles.length > 1) {
		const chosen = [...new Set([pick(others), pick(docFiles), pick(docFiles)])].slice(0, 2 + rand(2));
		const ws = chosen.map((f) => planWrite(f)).filter(Boolean);
		const outs = [];
		for (const w of ws) {
			write(w.file, w.text);
			outs.push(appEdit(w.file, w.text));
			await sleep(rand(300));
		}
		return { ws, outs: await Promise.all(outs) };
	}
	if (kind === 'overlap') {
		const a = planWrite(pick(docFiles));
		if (!a) return null;
		write(a.file, a.text);
		const first = appEdit(a.file, a.text);
		await sleep(20 + rand(280));
		const b = planWrite(rand(10) < 6 ? a.file : pick(docFiles));
		if (b) write(b.file, b.text);
		const second = b ? appEdit(b.file, b.text) : null;
		return { ws: [a, b].filter(Boolean), outs: await Promise.all([first, second].filter(Boolean)) };
	}
	if (kind === 'broken') {
		const w = planWrite(pick(docFiles));
		if (!w) return null;
		const before = texts.get(w.file);
		const bad = brokenText(w.text, before, rand);
		write(w.file, bad.text);
		const first = appEdit(w.file, bad.text);
		await sleep(100 + rand(400));
		write(w.file, w.text);
		w.what = `${bad.how}, then ${w.what}`;
		return { ws: [w], outs: await Promise.all([first, appEdit(w.file, w.text)]) };
	}
	if (kind === 'revise') {
		// an agent takes back all but its last hunk a moment later: the first write's pages above it are stale
		const w = planWrite(pick(docFiles));
		if (!w || w.hunks.length < 2) return null;
		const before = texts.get(w.file);
		const last = w.hunks.reduce((a, b) => (b.at > a.at ? b : a));
		const second = applyHunks(before.split('\n'), [last]);
		if (!refOf(new Map(texts).set(w.file, second))) return null;
		write(w.file, w.text);
		const first = appEdit(w.file, w.text);
		await sleep(30 + rand(300));
		write(w.file, second);
		w.what = `${w.what}, then only ${last.what}@${last.at + 1}`;
		return { ws: [w], outs: await Promise.all([first, appEdit(w.file, second)]) };
	}
	if (kind === 'compile') {
		const w = planWrite(pick(docFiles));
		if (!w) return null;
		const c = compileNow();
		// half the writes land near the compile's end, where a teleport outlives the index it started from
		await sleep(rand(2) ? 50 + rand(lastCompileMs) : lastCompileMs * (0.6 + rand(40) / 100));
		write(w.file, w.text);
		const outs = [await appEdit(w.file, w.text)];
		await c;
		return { ws: [w], outs, compiled: true };
	}
	const w = planWrite(kind === 'preamble' ? mainFile : pick(docFiles), kind === 'preamble');
	if (!w) return null;
	write(w.file, w.text);
	return { ws: [w], outs: [await appEdit(w.file, w.text)] };
}

// --dump=<dir>: each wrong page goes there as <write>.json, both pages as the engine wrote them
let dumpName = '';
function wrongAgainst(m) {
	const ref = refOf(m);
	const wrong = ref ? g.firstWrong(ref) : 'no reference';
	if (wrong && ref && dumpDir) {
		fs.mkdirSync(dumpDir, { recursive: true });
		g.dumpWrong(ref, wrong, path.join(dumpDir, `${dumpName}.json`));
	}
	return wrong;
}

const results = [];
for (let k = 0; k < writes; k++) {
	const kind = pick(kinds);
	const t1 = Date.now();
	const step = await runKind(kind);
	if (!step) {
		results.push({ kind, skipped: true });
		continue;
	}
	while (compiling) await compiling;
	const { outs } = step;
	// the screen holds, per file, the newest text a run showed
	for (const o of outs) if (o.outcome === 'shown') shownTexts.set(o.file, o.text);
	const anyShown = outs.some((o) => o.outcome === 'shown');
	const asked = outs.some((o) => o.outcome === 'compile');
	const r = {
		kind,
		what: step.ws.map((w) => `${w.file}: ${w.what}`).join('; '),
		outs: outs.map((o) => `${o.file} ${o.outcome} ${o.reason}`),
		ms: Date.now() - t1
	};
	dumpName = `${k + 1}`;
	if (asked) {
		await compileNow();
		r.wrong = wrongAgainst(texts);
	} else if (step.compiled) {
		// the compile's pages are up; only a shown teleport brings the rest compile after them
		if (anyShown) await compileNow();
		const wrong = wrongAgainst(texts);
		if (wrong) r[anyShown ? 'wrong' : 'stale'] = wrong;
	} else {
		r.wrong = wrongAgainst(shownTexts);
		const behind = [...texts.keys()].filter((f) => docFiles.includes(f) && texts.get(f) !== shownTexts.get(f));
		if (!r.wrong && behind.length && !anyShown) r.stale = { files: behind };
		// an agent rests between writes often enough for the compile after typing
		if (r.stale || (anyShown && rand(3) === 0)) {
			await compileNow();
			dumpName = `${k + 1}-rest`;
			const rest = wrongAgainst(texts);
			if (rest) r.rest = rest;
		}
	}
	if (!r.wrong) delete r.wrong;
	if (r.wrong || r.rest) await compileNow();
	results.push(r);
	const bad = r.wrong
		? ` WRONG ${JSON.stringify(r.wrong)}`
		: r.rest
			? ` REST WRONG ${JSON.stringify(r.rest)}`
			: r.stale
				? ` STALE ${JSON.stringify(r.stale)}`
				: '';
	console.error(`${k + 1}. ${kind} ${r.what} -> ${r.outs.join(', ')}${bad}`);
}
await compileNow();
dumpName = 'rest';
const rest = wrongAgainst(texts);
if (rest) console.error(`the compile once writing rests -> WRONG ${JSON.stringify(rest)}`);
g.close();
const wrong = results.filter((r) => r.wrong || r.rest).length + (rest ? 1 : 0);
const stale = results.filter((r) => r.stale).length;
const first = results.find((r) => r.wrong || r.rest || r.stale);
const summary = {
	folder: srcDir,
	main: mainFile,
	seed,
	// no file the app could open: every source is in another encoding than UTF-8
	outcome: wrong ? 'wrong' : stale ? 'stale' : docFiles.length ? 'ok' : 'no-utf8',
	writes: results.filter((r) => !r.skipped).length,
	wrong,
	stale,
	compiles: results.filter((r) => r.outs?.some((o) => / compile /.test(o))).length,
	compileMs,
	texErrors,
	files: docFiles.length,
	first: first ?? (rest ? { kind: 'rest', rest } : undefined),
	noInk: g.noInkTotal(),
	...(g.band ? { band: g.band.stats } : {})
};
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ...summary, results }, null, 1));
console.log(JSON.stringify(summary));
setTimeout(() => process.exit(wrong || stale ? 1 : 0), 600);
