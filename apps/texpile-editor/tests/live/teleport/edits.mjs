// The live-mode gate: a compile, then a script of random prose edits, each sent through the executor as the app
// sends it. After every edit the pages on screen (the compile's, with each teleport's pages and source line shifts
// applied) must equal a fresh run of the same text against the same seed files, record for record.
//   node tests/live/teleport/edits.mjs <folder> <main.tex> [--edits=12] [--seed=1] [--burst=1] [--json=out.json]
// --burst=K makes every K edits one line typed into: a word appended to the same line each time. --rapid=MS sends a
// burst's edits MS apart without waiting for each, as fast typing does, and compares once they all landed.
// --keys=N types N characters into one prose line instead, a keystroke every --rapid ms (150 by default, 80 wpm),
// and reports how long each keystroke took to reach the screen. --jump puts every edit of a burst at a random place in
// any file, as clicking around and typing does.
import fs from 'node:fs';
import path from 'node:path';
import { Gate, flags, seeded, sleep } from './gate.mjs';

const [srcDir, mainFile] = process.argv.slice(2);
const flag = flags(process.argv);
const edits = Number(flag('edits', 12));
const burst = Number(flag('burst', 1));
const keys = Number(flag('keys', 0));
const jump = process.argv.includes('--jump');
const rapid = Number(flag('rapid', keys ? 150 : 0));
const jsonOut = flag('json', '');
const dumpDir = flag('dump', '');
const rand = seeded(Number(flag('seed', 1)));
const WORDS = ['graph', 'theorem', 'model', 'value', 'equation', 'paper', 'system', 'field'];

// a change to a line of plain prose: a word, a sentence, a new paragraph, or the line gone
function editText(text, isMain) {
	const lines = text.split('\n');
	const begin = isMain ? lines.findIndex((l) => l.includes('\\begin{document}')) + 1 : 0;
	const prose = [];
	for (let i = begin; i < lines.length; i++) if (lines[i].trim().length > 20 && !/[\\%$]/.test(lines[i])) prose.push(i);
	if (!prose.length) return null;
	const i = prose[rand(prose.length)];
	const word = () => WORDS[rand(WORDS.length)];
	const op = rand(4);
	if (op === 0) {
		const words = lines[i].split(' ');
		words[rand(words.length)] = word();
		lines[i] = words.join(' ');
	} else if (op === 1) lines[i] += ` The ${word()} is ${word()} indeed.`;
	else if (op === 2) lines.splice(i + 1, 0, '', Array.from({ length: 40 }, word).join(' ') + '.');
	else lines.splice(i, 1);
	return { text: lines.join('\n'), what: ['word', 'sentence', 'paragraph', 'delete'][op], line: i + 1 };
}

const { gate: g, compiled } = await Gate.open(srcDir, mainFile, { band: process.argv.includes('--band'), dump: dumpDir });
if (!g) {
	console.log(JSON.stringify(compiled));
	process.exit(1);
}
const { files, texts, shownTexts } = g;
// the app opens only UTF-8 text: a folder with none has nothing to type into
if (!files.length) {
	g.close();
	console.log(JSON.stringify({ folder: srcDir, ok: false, error: 'no-utf8' }));
	setTimeout(() => process.exit(3), 500);
	await new Promise(() => undefined);
}

// --dump=<dir>: each wrong page goes there as <edit>.json, both pages as the engine wrote them
function wrongAgainst(ref, name) {
	const wrong = g.firstWrong(ref);
	if (wrong && dumpDir) {
		fs.mkdirSync(dumpDir, { recursive: true });
		g.dumpWrong(ref, wrong, path.join(dumpDir, `${name}.json`));
	}
	return wrong;
}

async function restWrong() {
	await g.compileSaved();
	const ref = g.reference(texts);
	return ref ? wrongAgainst(ref, 'rest') : null;
}

// a keystroke is on screen once a run for it or a later one shipped its first page
if (keys) {
	const file = files[rand(files.length)];
	const lines = texts.get(file).split('\n');
	const begin = file === mainFile ? lines.findIndex((l) => l.includes('\\begin{document}')) + 1 : 0;
	const prose = [];
	for (let i = begin; i < lines.length; i++) if (lines[i].trim().length > 20 && !/[\\%$]/.test(lines[i])) prose.push(i);
	if (!prose.length) {
		console.log(JSON.stringify({ folder: srcDir, keys: 0 }));
		process.exit(0);
	}
	const line = prose[rand(prose.length)];
	const typed = WORDS.map((w) => ` ${w}`)
		.join('')
		.repeat(Math.ceil(keys / 40))
		.slice(0, keys);
	const sends = [];
	for (let k = 0; k < keys; k++) {
		lines[line] += typed[k];
		const text = lines.join('\n');
		texts.set(file, text);
		const at = Date.now();
		sends.push(Object.assign(g.send(file, text), { at, text }));
		if (k + 1 < keys) await sleep(rapid);
	}
	const outcomes = await Promise.all(sends.map((s) => s.landed));
	const lat = sends.map((s, k) => {
		const later = sends
			.slice(k)
			.map((x) => x.firstAt)
			.filter((t) => t !== null);
		return later.length ? Math.min(...later) - s.at : null;
	});
	// the screen holds the last keystroke a run showed; one that leaves its paragraph open waits for the next
	const lastShown = outcomes.findLastIndex((o) => o.ok);
	if (lastShown >= 0) shownTexts.set(file, sends[lastShown].text);
	// the last keystroke's run failed after shipping pages: the app compiles, which the rest compile below stands for
	const final = outcomes.at(-1);
	const compiles = !final.ok && !['held', 'outside', 'superseded'].includes(final.reason);
	const ref = compiles ? null : g.reference(shownTexts);
	const wrong = compiles ? null : ref ? wrongAgainst(ref, 'keys') : 'no reference';
	const sorted = lat.filter((v) => v !== null).sort((a, b) => a - b);
	const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null;
	const reasons = {};
	for (const o of outcomes) {
		const k = o.ok ? 'shown' : o.reason;
		reasons[k] = (reasons[k] ?? 0) + 1;
	}
	console.error(`typed ${keys} keys into ${file}:${line + 1}, one every ${rapid} ms: ${JSON.stringify(reasons)}`);
	console.error(`latency per keystroke: ${lat.join(' ')}`);
	if (process.env.TELE_DEBUG) for (const o of outcomes) console.error(JSON.stringify({ ...o, srcFiles: undefined }));
	const rest = await restWrong();
	g.close();
	const summary = {
		folder: srcDir,
		keys,
		rapid,
		wrong,
		rest,
		median: pick(0.5),
		p90: pick(0.9),
		max: sorted.at(-1) ?? null,
		last: lat.at(-1),
		never: lat.filter((v) => v === null).length,
		noInk: g.noInkTotal(),
		...(g.band ? { band: g.band.stats } : {})
	};
	if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ ...summary, lat, reasons }, null, 1));
	console.log(JSON.stringify(summary));
	setTimeout(() => {
		process.exit(wrong || rest || summary.noInk ? 1 : 0);
	}, 500);
	await new Promise(() => undefined);
}

const results = [];
const inFlight = [];
let typing = null;
for (let k = 0; k < edits; k++) {
	const typed = !jump && k % burst && typing;
	const file = typed ? typing.file : files[rand(files.length)];
	let e;
	if (typed) {
		const lines = texts.get(file).split('\n');
		lines[typing.line - 1] += ` ${WORDS[rand(WORDS.length)]}`;
		e = { text: lines.join('\n'), what: 'typing', line: typing.line };
	} else e = editText(texts.get(file), file === mainFile);
	if (!e) continue;
	typing = e.what === 'delete' ? null : { file, line: e.line };
	texts.set(file, e.text);
	const t1 = Date.now();
	const sentEdit = g.send(file, e.text);
	const { got, landed } = sentEdit;
	// fast typing: the next keystroke comes before this one's pages; the last of the burst is waited for
	if (rapid && (k + 1) % burst && k + 1 < edits) {
		inFlight.push(landed.then((r) => ({ r, got, file, text: e.text, what: `${e.what} ${file}:${e.line}` })));
		await sleep(rapid);
		continue;
	}
	const res = await landed;
	let compileFor = !res.ok && !['held', 'outside', 'superseded'].includes(res.reason);
	// the earlier edits of the burst in the order they came: a later edit of the same file holds an earlier one
	for (const x of await Promise.all(inFlight.splice(0))) {
		if (x.r.ok || x.r.reason !== 'superseded') console.error(`   earlier edit of the burst, ${x.what}: ${x.r.ok ? 'shown' : x.r.reason}`);
		// a shown edit stays on screen while a later one in its file is held, as do the pages a superseded run shipped
		const shipped = x.r.ok || (x.r.reason === 'superseded' && x.got.length > 0);
		if (shipped || (x.file !== file && !['held', 'superseded'].includes(x.r.reason))) shownTexts.set(x.file, x.text);
		if (x.file !== file && !x.r.ok && !['held', 'outside', 'superseded'].includes(x.r.reason)) compileFor = true;
	}
	if (res.ok || res.reason !== 'held') shownTexts.set(file, e.text);
	// what the app compiles for; an edit to a file the document does not read shows nothing
	if (compileFor) {
		await g.compileSaved();
		await sleep(3000);
	}
	const ref = g.reference(shownTexts);
	if (!ref) {
		console.error(`${k + 1}. ${e.what} ${file}:${e.line} -> the document no longer compiles`);
		results.push({ edit: e.what, at: `${file}:${e.line}`, broken: true });
		continue;
	}
	const wrong = wrongAgainst(ref, `${k + 1}`);
	const firstPage = sentEdit.firstAt === null ? null : sentEdit.firstAt - t1;
	const r = {
		edit: e.what,
		at: `${file}:${e.line}`,
		...(res.ok ? { ms: res.ms, firstPage, pages: got.map((p) => p.n), stop: res.stop ?? 'end' } : { reason: res.reason }),
		wrong
	};
	results.push(r);
	console.error(
		`${k + 1}. ${r.edit} ${r.at} -> ${res.ok ? `${r.ms} ms, first page ${firstPage} ms, pages ${r.pages.join(',') || '-'}, stop ${r.stop}` : `${res.reason} ${res.detail ?? ''}`}${wrong ? ' WRONG ' + JSON.stringify(wrong) : ''}`
	);
}
const rest = await restWrong();
if (rest) console.error(`the compile once typing rests -> WRONG ${JSON.stringify(rest)}`);
g.close();
const firsts = results
	.map((r) => r.firstPage)
	.filter((v) => typeof v === 'number')
	.sort((a, b) => a - b);
const summary = {
	folder: srcDir,
	edits: results.length,
	wrong: results.filter((r) => r.wrong).length + (rest ? 1 : 0),
	compiles: results.filter((r) => r.reason && !['held', 'outside'].includes(r.reason)).length,
	held: results.filter((r) => r.reason === 'held').length,
	firstPageMedian: firsts[Math.floor(firsts.length / 2)] ?? null,
	noInk: g.noInkTotal(),
	...(g.band ? { band: g.band.stats } : {}),
	results
};
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, results: undefined }));
setTimeout(() => {
	process.exit(summary.wrong || summary.noInk ? 1 : 0);
}, 500);
