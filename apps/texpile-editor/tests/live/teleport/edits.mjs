// The live-mode gate: a compile, then a script of random prose edits, each sent through the executor as the app
// sends it. After every edit the pages on screen (the compile's, with each teleport's pages and source line shifts
// applied) must equal a fresh run of the same text against the same seed files, record for record.
//   node tests/live/teleport/edits.mjs <folder> <main.tex> [--edits=12] [--seed=1] [--burst=1] [--json=out.json]
// --burst=K makes every K edits one line typed into: a word appended to the same line each time. --rapid=MS sends a
// burst's edits MS apart without waiting for each, as fast typing does, and compares once they all landed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../../../../electron/src');
const engineDir = path.resolve(here, '../../../../../electron/lua').replace(/\\/g, '/');
const [srcDir, mainFile] = process.argv.slice(2);
const flag = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const edits = Number(flag('edits', 12));
const burst = Number(flag('burst', 1));
const rapid = Number(flag('rapid', 0));
const jsonOut = flag('json', '');
let seed = Number(flag('seed', 1));
const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), Math.floor(seed / 65536) % n);
const WORDS = ['graph', 'theorem', 'model', 'value', 'equation', 'paper', 'system', 'field'];
const readBack = { byTex: ['aux', 'toc', 'lof', 'lot', 'out', 'nav', 'snm'], byTools: ['bbl'] };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tele-edits-'));
const bundle = path.join(tmp, 'executor.cjs');
buildSync({
	stdin: {
		contents: `export * as service from './draft/draftService'; export * as teleport from './draft/teleport/teleportService'; export * as job from './draft/compileJob';`,
		resolveDir: src,
		loader: 'ts'
	},
	outfile: bundle,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	external: ['electron', 'node-pty'],
	logLevel: 'silent'
});
const { service, teleport, job } = createRequire(import.meta.url)(bundle);

function norm(records, root) {
	const lines = records
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const fonts = new Map(lines.filter((r) => r.t === 'font').map((r) => [r.id, `${path.basename(r.file || '')}@${r.size}`]));
	return lines
		.filter((r) => r.t !== 'font')
		.map((r) => {
			const o = { ...r };
			if (o.f !== undefined) o.f = fonts.get(o.f);
			if (o.file) o.file = o.file.replace(root.replace(/\\/g, '/'), '');
			return JSON.stringify(o);
		});
}

// what a compile of this exact text produces, read against the same seed files the teleports read
function reference(root, texts, seedDir) {
	const ref = fs.mkdtempSync(path.join(tmp, 'ref-'));
	fs.cpSync(root, ref, { recursive: true, filter: (p) => !p.replace(/\\/g, '/').includes('/_draft') });
	for (const [rel, t] of texts) fs.writeFileSync(path.join(ref, rel), t);
	const out = '_draft/ref';
	fs.mkdirSync(path.join(ref, out, 'tele'), { recursive: true });
	fs.cpSync(seedDir, path.join(ref, out), { recursive: true });
	job.mirrorSourceFolders(ref, path.join(ref, out));
	job.writeHooksFile(path.join(ref, out));
	spawnSync(
		'lualatex',
		[
			'-no-shell-escape',
			'-interaction=nonstopmode',
			`-output-directory=${out}`,
			'-jobname=draft',
			job.engineJob(engineDir, out, mainFile, false)
		],
		{
			cwd: ref,
			env: { ...process.env, max_print_line: '100000' },
			maxBuffer: 1 << 28
		}
	);
	// an edit can break the document outright; there is nothing to compare then
	const manifest = path.join(ref, out, 'pages.json');
	if (!fs.existsSync(manifest)) {
		fs.rmSync(ref, { recursive: true, force: true });
		return null;
	}
	const man = JSON.parse(fs.readFileSync(manifest, 'utf8'));
	const pages = [];
	for (let n = 1; n <= man.count; n++)
		pages[n] = norm(fs.readFileSync(path.join(ref, out, `page-${String(n).padStart(3, '0')}.jsonl`), 'utf8'), ref);
	fs.rmSync(ref, { recursive: true, force: true });
	return pages;
}

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

const root = path.join(tmp, 'doc');
fs.cpSync(srcDir, root, { recursive: true });
const t0 = Date.now();
const compiled = await service.compileDraft({ root, mainFile, engineDir, readBack });
if (!compiled.ok) {
	console.log(JSON.stringify(compiled));
	process.exit(1);
}
console.error(`compile ${Date.now() - t0} ms, ${compiled.count} pages`);
let shown = [];
for (const p of compiled.pages) shown[p.n] = norm(p.records, root);
const files = [];
(function walk(dir, rel) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const r = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory() && e.name !== '_draft') walk(path.join(dir, e.name), r);
		else if (e.name.endsWith('.tex')) files.push(r);
	}
})(root, '');
const texts = new Map(files.map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
// what the preview should show: a held edit waits for the next keystroke in its file
const shownTexts = new Map(texts);
// the spares read the preamble while the user would still be reading the page
await new Promise((r) => setTimeout(r, 4000));
// the folder of seeds the last compile read: the sweep after a compile leaves only that one
let seedDir = null;
async function settleSeeds() {
	const dir = path.join(root, '_draft', 'seeds');
	for (let i = 0; i < 50; i++) {
		const names = fs.readdirSync(dir).filter((n) => !n.endsWith('.part'));
		if (names.length === 1) return (seedDir = path.join(dir, names[0]));
		await new Promise((r) => setTimeout(r, 100));
	}
	throw new Error('more than one seed folder after the compile');
}
await settleSeeds();

const results = [];
const inFlight = [];
let typing = null;
for (let k = 0; k < edits; k++) {
	const file = k % burst && typing ? typing.file : files[rand(files.length)];
	let e;
	if (k % burst && typing) {
		const lines = texts.get(file).split('\n');
		lines[typing.line - 1] += ` ${WORDS[rand(WORDS.length)]}`;
		e = { text: lines.join('\n'), what: 'typing', line: typing.line };
	} else e = editText(texts.get(file), file === mainFile);
	if (!e) continue;
	typing = e.what === 'delete' ? null : { file, line: e.line };
	texts.set(file, e.text);
	const t1 = Date.now();
	let firstPage = null;
	const got = [];
	const sent = teleport.teleport({ root, mainFile, file, text: e.text }, (p) => {
		if (firstPage === null) firstPage = Date.now() - t1;
		got.push(p);
		// pages land on screen as they come, whichever edit they are for
		shown[p.n] = norm(p.records, root);
	});
	// as the app does when a result lands: the pages past the stop move their source lines, or the count is new
	const landed = sent.then((res) => {
		if (res.ok && res.shift)
			for (let n = res.stop + 1; n < shown.length; n++)
				shown[n] = shown[n]?.map((l) => {
					const r = JSON.parse(l);
					if (r.s !== undefined && (r.sf ?? 0) === res.shift.sf && r.s > res.shift.after) r.s += res.shift.by;
					return JSON.stringify(r);
				});
		if (res.ok && res.stop === undefined) shown = shown.slice(0, res.count + 1);
		return res;
	});
	// fast typing: the next keystroke comes before this one's pages; the last of the burst is waited for
	if (rapid && (k + 1) % burst && k + 1 < edits) {
		inFlight.push(landed);
		await new Promise((r) => setTimeout(r, rapid));
		continue;
	}
	const res = await landed;
	if (res.ok || res.reason !== 'held') shownTexts.set(file, e.text);
	for (const r of await Promise.all(inFlight.splice(0)))
		if (r.ok || r.reason !== 'superseded') console.error(`   earlier edit of the burst: ${r.ok ? 'shown' : r.reason}`);
	if (!res.ok && res.reason !== 'held') {
		// what the app does then: a full compile of the saved text
		for (const [rel, t] of texts) {
			fs.writeFileSync(path.join(root, rel), t);
			shownTexts.set(rel, t);
		}
		const again = await service.compileDraft({ root, mainFile, engineDir, readBack });
		shown = [];
		if (again.ok) for (const p of again.pages) shown[p.n] = norm(p.records, root);
		await settleSeeds();
		await new Promise((r) => setTimeout(r, 3000));
	}
	const ref = reference(root, shownTexts, seedDir);
	if (!ref) {
		console.error(`${k + 1}. ${e.what} ${file}:${e.line} -> the document no longer compiles`);
		results.push({ edit: e.what, at: `${file}:${e.line}`, broken: true });
		continue;
	}
	let wrong = null;
	for (let n = 1; n < Math.max(ref.length, shown.length) && !wrong; n++) {
		const a = ref[n] ?? [];
		const b = shown[n] ?? [];
		for (let i = 0; i < Math.max(a.length, b.length); i++)
			if (a[i] !== b[i]) {
				wrong = { page: n, at: i, ref: a[i]?.slice(0, 120), got: b[i]?.slice(0, 120) };
				break;
			}
	}
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
teleport.stopTeleports();
const firsts = results
	.map((r) => r.firstPage)
	.filter((v) => typeof v === 'number')
	.sort((a, b) => a - b);
const summary = {
	folder: srcDir,
	edits: results.length,
	wrong: results.filter((r) => r.wrong).length,
	compiles: results.filter((r) => r.reason && r.reason !== 'held').length,
	held: results.filter((r) => r.reason === 'held').length,
	firstPageMedian: firsts[Math.floor(firsts.length / 2)] ?? null,
	results
};
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ ...summary, results: undefined }));
setTimeout(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
	process.exit(summary.wrong ? 1 : 0);
}, 500);
