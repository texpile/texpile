// What the live gates share: the executor bundled from electron/src, a copy of the folder compiled once, the pages on
// screen as the app keeps them, and a fresh lualatex run of any text to compare them with.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { BandOracle } from './bandOracle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../../../../electron/src');
const engineDir = path.resolve(here, '../../../../../electron/lua').replace(/\\/g, '/');
const readBack = { byTex: ['aux', 'toc', 'lof', 'lot', 'out', 'nav', 'snm'], byTools: ['bbl'] };

export function flags(argv) {
	return (k, d) => (argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
}

export function seeded(start) {
	let seed = start;
	return (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), Math.floor(seed / 65536) % n);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bundle(tmp) {
	const out = path.join(tmp, 'executor.cjs');
	buildSync({
		stdin: {
			contents: `export * as service from './draft/draftService'; export * as teleport from './draft/teleport/teleportService'; export * as job from './draft/compileJob'; export * as engine from './draft/teleport/draftEngine';`,
			resolveDir: src,
			loader: 'ts'
		},
		outfile: out,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node22',
		external: ['electron', 'node-pty'],
		logLevel: 'silent'
	});
	return createRequire(import.meta.url)(out);
}

function norm(records, root) {
	const lines = records
		.split('\n')
		.filter(Boolean)
		.map((l) => JSON.parse(l));
	const fonts = new Map(lines.filter((r) => r.t === 'font').map((r) => [r.id, `${path.basename(r.file || '') || r.name}@${r.size}`]));
	return lines
		.filter((r) => r.t !== 'font')
		.map((r) => {
			const o = { ...r };
			if (o.f !== undefined) o.f = fonts.get(o.f);
			// a page as the app reads it names its images by absolute path, the engine's own file relative to the folder
			if (o.file) o.file = path.resolve(root, o.file).replace(/\\/g, '/').replace(root.replace(/\\/g, '/'), '');
			return JSON.stringify(o);
		});
}

// a line record names its file by name: two runs number their files in the order each met them
function fileNamed(line, srcFiles) {
	if (!line.includes('"sf":')) return line;
	const r = JSON.parse(line);
	r.sf = srcFiles[r.sf - 1] ?? r.sf;
	return JSON.stringify(r);
}

export class Gate {
	shown = [];
	// each page on screen as the engine wrote it, fonts and image files included, for a picture of a wrong page
	raw = [];
	seedDir = null;
	// the file table a line record's sf indexes on screen; a teleport keeps the compile's ids, a fresh run numbers its own
	srcFiles = [];
	noInk = new Map();
	band = null;

	/** copies the folder, compiles it and waits for the spares; null with the compile's result when it fails */
	static async open(srcDir, mainFile, { band = false, dump = '' } = {}) {
		const g = new Gate(srcDir, mainFile);
		if (band) g.band = new BandOracle(g.tmp, g.texts, dump);
		const t0 = Date.now();
		const compiled = await g.service.compileDraft({ root: g.root, mainFile, engineDir, readBack });
		if (!compiled.ok) {
			g.close();
			return { gate: null, compiled };
		}
		console.error(`compile ${Date.now() - t0} ms, ${compiled.count} pages`);
		g.srcFiles = compiled.srcFiles ?? [];
		for (const p of compiled.pages) [g.shown[p.n], g.raw[p.n]] = [norm(p.records, g.root), p.records];
		// the spares read the preamble while the user would still be reading the page
		await sleep(4000);
		await g.settleSeeds();
		return { gate: g, compiled };
	}

	constructor(srcDir, mainFile) {
		this.srcDir = srcDir;
		this.mainFile = mainFile;
		this.tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tele-edits-'));
		Object.assign(this, bundle(this.tmp));
		// FORGOT: a point an engine kept did not come back, and the edit took the long way from the base
		this.forgot = 0;
		this.engine.followEngines((name, kind, rest) => {
			if (kind === 'FORGOT') this.forgot++;
			if (process.env.TELE_TRACE) console.error(`[${name}] ${kind} ${rest.slice(0, 400)}`);
		});
		this.root = path.join(this.tmp, 'doc');
		fs.cpSync(srcDir, this.root, { recursive: true });
		this.files = [];
		const walk = (dir, rel) => {
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				const r = rel ? `${rel}/${e.name}` : e.name;
				if (e.isDirectory() && e.name !== '_draft') walk(path.join(dir, e.name), r);
				else if (e.name.endsWith('.tex')) this.files.push(r);
			}
		};
		walk(this.root, '');
		// the app opens only UTF-8 text, so a file in another encoding is never edited and never rewritten
		const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
		const decoded = this.files.map((f) => {
			try {
				return [f, utf8.decode(fs.readFileSync(path.join(this.root, f)))];
			} catch {
				return null;
			}
		});
		this.texts = new Map(decoded.filter(Boolean));
		this.files = this.files.filter((f) => this.texts.has(f));
		// what the preview should show: a held edit waits for the next keystroke in its file
		this.shownTexts = new Map(this.texts);
	}

	close() {
		this.teleport.stopTeleports();
		if (!process.env.TELE_KEEP) setTimeout(() => fs.rmSync(this.tmp, { recursive: true, force: true }), 500);
	}

	// the folder of seeds the last compile read: the sweep after a compile leaves only that one
	async settleSeeds() {
		const dir = path.join(this.root, '_draft', 'seeds');
		for (let i = 0; i < 300; i++) {
			const names = fs.readdirSync(dir).filter((n) => !n.endsWith('.part'));
			if (names.length === 1) return (this.seedDir = path.join(dir, names[0]));
			await sleep(100);
		}
		throw new Error('more than one seed folder after the compile');
	}

	/** what a compile of this exact text produces, read against the same seed files the teleports read */
	reference(texts) {
		const ref = fs.mkdtempSync(path.join(this.tmp, 'ref-'));
		fs.cpSync(this.root, ref, { recursive: true, filter: (p) => !p.replace(/\\/g, '/').includes('/_draft') });
		for (const [rel, t] of texts) fs.writeFileSync(path.join(ref, rel), t);
		const out = '_draft/ref';
		fs.mkdirSync(path.join(ref, out, 'tele'), { recursive: true });
		fs.cpSync(this.seedDir, path.join(ref, out), { recursive: true });
		this.job.mirrorSourceFolders(ref, path.join(ref, out));
		this.job.writeHooksFile(path.join(ref, out));
		spawnSync(
			'lualatex',
			[
				'-no-shell-escape',
				'-interaction=nonstopmode',
				`-output-directory=${out}`,
				'-jobname=draft',
				this.job.engineJob(engineDir, out, this.mainFile, false)
			],
			{ cwd: ref, env: { ...process.env, max_print_line: '100000' }, maxBuffer: 1 << 28 }
		);
		// an edit can break the document outright; there is nothing to compare then
		const manifest = path.join(ref, out, 'pages.json');
		if (!fs.existsSync(manifest)) {
			fs.rmSync(ref, { recursive: true, force: true });
			return null;
		}
		const man = JSON.parse(fs.readFileSync(manifest, 'utf8'));
		const pages = [];
		pages.raw = [];
		pages.srcFiles = man.srcFiles ?? [];
		for (let n = 1; n <= man.count; n++) {
			pages.raw[n] = fs.readFileSync(path.join(ref, out, `page-${String(n).padStart(3, '0')}.jsonl`), 'utf8');
			pages[n] = norm(pages.raw[n], ref);
		}
		fs.rmSync(ref, { recursive: true, force: true });
		return pages;
	}

	// what a teleported page holds that the preview cannot draw: glyphs by font, images by file. They show as gray boxes
	countNoInk(records) {
		const lines = records
			.split('\n')
			.filter(Boolean)
			.map((l) => JSON.parse(l));
		const fonts = new Map(lines.filter((r) => r.t === 'font').map((r) => [r.id, r]));
		const add = (k) => this.noInk.set(k, (this.noInk.get(k) ?? 0) + 1);
		for (const r of lines) {
			if (r.t === 'image' && !(r.file && fs.existsSync(r.file))) add(`image ${r.file}`);
			if (r.t !== 'g' && r.t !== 'ng') continue;
			const f = fonts.get(r.f);
			if (f && (f.t1 || /\.(otf|ttf|ttc)$/i.test(f.file || ''))) continue;
			add(f?.name || `font ${r.f}`);
		}
	}

	noInkTotal() {
		if (this.noInk.size) console.error(`what the preview cannot draw: ${JSON.stringify(Object.fromEntries(this.noInk))}`);
		return [...this.noInk.values()].reduce((a, b) => a + b, 0);
	}

	/** one edit sent as the app sends it: pages land on screen as they come, whichever edit they are for */
	send(file, text) {
		const out = { got: [], firstAt: null };
		const seq = this.band?.start(file, text);
		const sent = this.teleport.teleport({ root: this.root, mainFile: this.mainFile, file, text }, (p) => {
			if (out.firstAt === null) out.firstAt = Date.now();
			out.got.push(p);
			this.band?.page(seq, p, this.raw[p.n]);
			[this.shown[p.n], this.raw[p.n]] = [norm(p.records, this.root), p.records];
			this.countNoInk(p.records);
		});
		// as the app does when a result lands: the pages past the stop move their source lines, or the count is new
		out.landed = sent.then((res) => {
			this.band?.landed(seq, res, file);
			if (res.ok && res.srcFiles?.length) this.srcFiles = res.srcFiles;
			if (res.shifts) this.moveSourceLines(res.stop, res.shifts);
			if (res.ok && res.stop === undefined) [this.shown, this.raw] = [this.shown.slice(0, res.count + 1), this.raw.slice(0, res.count + 1)];
			return res;
		});
		return out;
	}

	moveSourceLines(stop, shifts) {
		for (let n = stop + 1; n < this.shown.length; n++)
			this.shown[n] = this.shown[n]?.map((l) => {
				const r = JSON.parse(l);
				for (const { sf, after, by } of shifts) if (r.s !== undefined && (r.sf ?? 0) === sf && r.s > after) r.s += by;
				return JSON.stringify(r);
			});
	}

	firstWrong(ref) {
		for (let n = 1; n < Math.max(ref.length, this.shown.length); n++) {
			const a = (ref[n] ?? []).map((l) => fileNamed(l, ref.srcFiles));
			const b = (this.shown[n] ?? []).map((l) => fileNamed(l, this.srcFiles));
			for (let i = 0; i < Math.max(a.length, b.length); i++)
				if (a[i] !== b[i]) return { page: n, at: i, ref: a[i]?.slice(0, 120), got: b[i]?.slice(0, 120) };
		}
		return null;
	}

	/** the wrong page as the screen holds it and as the fresh run made it, for tools/renderWrong in texpile-tools */
	dumpWrong(ref, wrong, file) {
		fs.writeFileSync(file, JSON.stringify({ wrong, live: this.raw[wrong.page] ?? '', compile: ref.raw?.[wrong.page] ?? '' }));
	}

	/** a compile of what disk holds now; its pages replace the screen once it lands */
	startCompile() {
		const disk = new Map(this.texts);
		return this.service.compileDraft({ root: this.root, mainFile: this.mainFile, engineDir, readBack }).then(async (again) => {
			if (again.superseded) return again;
			[this.shown, this.raw] = [[], []];
			this.band?.compiled(disk);
			if (again.ok) this.srcFiles = again.srcFiles ?? [];
			if (again.ok) for (const p of again.pages) [this.shown[p.n], this.raw[p.n]] = [norm(p.records, this.root), p.records];
			await this.settleSeeds();
			return again;
		});
	}

	writeDisk() {
		for (const [rel, t] of this.texts) fs.writeFileSync(path.join(this.root, rel), t);
	}

	/** what the app compiles when a teleport cannot show an edit, and once typing rests: the saved text */
	async compileSaved() {
		this.writeDisk();
		for (const [rel, t] of this.texts) this.shownTexts.set(rel, t);
		return this.startCompile();
	}
}
