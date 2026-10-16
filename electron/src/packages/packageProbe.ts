// asks the reader's own LuaTeX which commands a package defines and what arguments each takes:
// one run per package and option set, cached until the .sty changes
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { luaDir } from '../appIdentity';
import { killTree } from '../shell/killTree';
import { kpsewhich } from '../shell/kpsewhich';
import { shellEnvReady } from '../shell/shellEnv';
import { onToolPathChange } from '../shell/toolDirs';
import { cachedProbe, storeProbe } from './probeCache';

/** spec: m/o tokens for a plain macro, or "X <xparse spec>" for a \NewDocumentCommand; own: defined while the package
 * itself loaded and named in its own files, so not a command of a package it loads; redefined: it existed before */
export type ProbedCommand = { name: string; spec: string; own?: boolean; redefined?: boolean };
export type PackageProbe = { commands: ProbedCommand[] };

const NAME = /^[\w.+-]+$/;
// options go into the probe's own source, so only what package options are made of
const OPTIONS = /^[\w\s.,=:+\-/]{0,300}$/;
const TIMEOUT_MS = 20000;
const RUNNING_AT_ONCE = 2;
const MAX_STY_BYTES = 2 * 1024 * 1024;

const inflight = new Map<string, Promise<PackageProbe | null>>();
// a package that fails to load fails again until the TeX installation changes
const failed = new Set<string>();
onToolPathChange(() => failed.clear());

let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(run: () => Promise<T>): Promise<T> {
	if (running >= RUNNING_AT_ONCE) await new Promise<void>((r) => waiting.push(r));
	running++;
	try {
		return await run();
	} finally {
		running--;
		waiting.shift()?.();
	}
}

function probeSource(name: string, options: string, classOptions: string): string {
	return [
		`\\documentclass[${classOptions}]{article}`,
		'\\usepackage{xparse}',
		`\\directlua{dofile(os.getenv("TEXPILE_PROBE_LUA")) probe_before("${name}")}`,
		'\\ifdefined\\AddToHook',
		'\\AddToHook{file/before}{\\directlua{probe_file_open()}}',
		'\\AddToHook{file/after}{\\directlua{probe_file_close()}}',
		'\\fi',
		`\\usepackage[${options}]{${name}}`,
		'\\begin{document}',
		'\\directlua{probe_after()}',
		'\\end{document}',
		''
	].join('\n');
}

export function parseProbe(text: string): PackageProbe {
	const commands: ProbedCommand[] = [];
	for (const line of text.split(/\r?\n/)) {
		const [name, spec, marks = ''] = line.split('\t');
		if (!name || spec === undefined) continue;
		// d: another package defined it while this one loaded it
		const command: ProbedCommand = { name, spec, own: !marks.includes('d') };
		if (marks.includes('r')) command.redefined = true;
		commands.push(command);
	}
	return { commands };
}

async function run(sty: string, name: string, options: string, classOptions: string): Promise<PackageProbe | null> {
	const dir = await fs.promises.mkdtemp(join(tmpdir(), 'texpile-probe-'));
	try {
		await fs.promises.writeFile(join(dir, 'probe.tex'), probeSource(name, options, classOptions));
		await shellEnvReady();
		const finished = await new Promise<boolean>((resolve) => {
			const child = spawn('lualatex', ['-no-shell-escape', '-interaction=batchmode', '-jobname=probe', 'probe.tex'], {
				cwd: dir,
				env: { ...process.env, TEXPILE_PROBE_LUA: join(luaDir(), 'package-probe.lua').replace(/\\/g, '/') },
				stdio: 'ignore',
				windowsHide: true,
				detached: process.platform !== 'win32'
			});
			const timer = setTimeout(() => {
				if (child.pid) killTree(child.pid);
				resolve(false);
			}, TIMEOUT_MS);
			child.on('error', () => {
				clearTimeout(timer);
				resolve(false);
			});
			child.on('exit', () => {
				clearTimeout(timer);
				resolve(true);
			});
		});
		if (!finished) return null;
		const text = await fs.promises.readFile(join(dir, 'probe.probe'), 'utf8').catch(() => null);
		if (text === null) return null;
		const probe = parseProbe(text);
		// TikZ and babel read files with a plain \input that LaTeX's file hooks never see, so the name must be a word of the package's own files too
		const words = new Set((await ownSource(sty, name)).match(/[A-Za-z]+/g));
		// \newif\iffoo names \footrue and \foofalse only as it runs
		function named(n: string): boolean {
			return words.has(n) || words.has(`if${n.replace(/(?:true|false)$/, '')}`);
		}
		for (const c of probe.commands) c.own = !!c.own && named(c.name);
		return probe;
	} finally {
		void fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

// the .sty and the files beside it named like it (soul.sty loads soul-ori.sty), which the probe counts as the package's own
async function ownSource(sty: string, name: string): Promise<string> {
	const dir = dirname(sty);
	const siblings = await fs.promises.readdir(dir).catch((): string[] => []);
	let text = '';
	// a dated file is an old release (\DeclareRelease), not part of this one
	const own = siblings.filter((f) => f !== basename(sty) && f.startsWith(name) && !/-\d{4}-\d{2}-\d{2}\./.test(f));
	for (const file of [basename(sty), ...own]) {
		const size = await fs.promises.stat(join(dir, file)).then(
			(st) => (st.isFile() ? st.size : Infinity),
			() => Infinity
		);
		if (text.length + size > MAX_STY_BYTES) continue;
		text += await fs.promises.readFile(join(dir, file), 'latin1').catch(() => '');
	}
	return text;
}

export async function probePackage(name: string, options = '', classOptions = ''): Promise<PackageProbe | null> {
	if (!NAME.test(name)) return null;
	// options outside that set are left off, and the package loads with its defaults
	const opts = OPTIONS.test(options) ? options.trim() : '';
	const classOpts = OPTIONS.test(classOptions) ? classOptions.trim() : '';
	const key = `${name}[${opts}]{${classOpts}}`;
	if (failed.has(key)) return null;
	const sty = await kpsewhich(`${name}.sty`);
	if (!sty) return null;
	const mtime = await fs.promises.stat(sty).then(
		(s) => s.mtimeMs,
		() => -1
	);
	const hit = cachedProbe(key, sty, mtime);
	if (hit) return hit;
	let pending = inflight.get(key);
	if (!pending) {
		pending = slot(() => run(sty, name, opts, classOpts))
			.catch(() => null)
			.then((probe) => {
				inflight.delete(key);
				if (probe) storeProbe(key, sty, mtime, probe);
				else failed.add(key);
				return probe;
			});
		inflight.set(key, pending);
	}
	return pending;
}
