// the single implementation of workspace file ops; keep it dependency-free (node builtins only)
import { readdir, readFile, writeFile, mkdir, rm, rename, stat, cp } from 'node:fs/promises';
import { join, dirname, basename, extname, relative, sep, isAbsolute, normalize, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';

// '_draft' holds Draft-mode's transient compile artifacts (page records, daemon wrapper,
// draft.pdf) -- never surface them in the tree, scan, or search.
// Two tiers of ignoring, plus dot-dirs (.git, .cache, ...) skipped everywhere via skipDir:
// - TREE stays permissive: it IS the workspace view, and a LaTeX project legitimately
//   contains dirs named build/ or output/ (the compile output dir, see the renderer's
//   ensureOutputDir) -- hiding output/ would break finding the compiled PDF in the tree.
// - scan and search are noise-sensitive, so they also skip common build-output names.
const TREE_IGNORE_DIRS = new Set(['node_modules', '_draft']);
const SCAN_IGNORE_DIRS = new Set([...TREE_IGNORE_DIRS, 'build', 'dist', 'out', 'output']);
const skipDir = (name: string, ignore: Set<string>) => name.startsWith('.') || ignore.has(name);

// one collator for all name sorting; localeCompare per comparison is surprisingly expensive
const collator = new Intl.Collator();

export const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
	'.pdf': 'application/pdf'
};

export interface TexFile {
	name: string;
	path: string;
	relPath: string;
}

export interface TreeNode {
	name: string;
	path: string;
	type: 'dir' | 'file';
	children?: TreeNode[];
}

export interface SearchFileResult {
	file: string;
	rel: string;
	matches: { line: number; text: string }[];
}

function parseExts(extsCsv?: string): string[] {
	return (extsCsv || 'tex')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

async function scanWalk(dir: string, root: string, acc: TexFile[], depth: number, exts: string[]): Promise<void> {
	if (depth > 12) return;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	const subdirs: string[] = [];
	for (const e of entries) {
		if (e.isDirectory()) {
			if (skipDir(e.name, SCAN_IGNORE_DIRS)) continue;
			subdirs.push(e.name);
		} else if (exts.some((ext) => e.name.toLowerCase().endsWith('.' + ext))) {
			const full = join(dir, e.name);
			acc.push({ name: e.name, path: full, relPath: full.slice(root.length).replace(/^[\\/]/, '') });
		}
	}
	// siblings in parallel; scan() sorts at the end, so interleaved pushes don't matter
	await Promise.all(subdirs.map((n) => scanWalk(join(dir, n), root, acc, depth + 1, exts)));
}

/** recursively scans `root` for files with the given extensions (default: tex). */
export async function scan(root: string, extsCsv?: string): Promise<{ root: string; files: TexFile[] }> {
	if (!root) throw new Error('Missing path');
	const exts = parseExts(extsCsv);
	const files: TexFile[] = [];
	await scanWalk(root, root, files, 0, exts);
	files.sort((a, b) => collator.compare(a.relPath, b.relPath));
	return { root, files };
}

export async function read(path: string): Promise<{ content: string }> {
	if (!path) throw new Error('Missing path');
	const content = await readFile(path, 'utf-8');
	return { content };
}

/** writes text, creating parent directories. */
export async function write(path: string, content: string): Promise<{ ok: true }> {
	if (!path || typeof content !== 'string') throw new Error('Missing path or content');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, 'utf-8');
	return { ok: true };
}

/** writes raw bytes, creating parent directories. */
export async function writeBinary(path: string, data: ArrayBuffer | Uint8Array): Promise<{ ok: true }> {
	if (!path || data == null) throw new Error('Missing path or file');
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, data instanceof Uint8Array ? data : Buffer.from(data));
	return { ok: true };
}

/** { exists, mtimeMs, size }, used to poll for a freshly-written compile output. */
export async function statFile(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number }> {
	if (!path) throw new Error('Missing path');
	try {
		const s = await stat(path);
		return { exists: true, mtimeMs: s.mtimeMs, size: s.size };
	} catch {
		return { exists: false, mtimeMs: 0, size: 0 };
	}
}

export async function fileBytes(path: string): Promise<{ data: Buffer; mime: string }> {
	if (!path) throw new Error('Missing path');
	const data = await readFile(path);
	const mime = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
	return { data, mime };
}

async function treeBuild(dir: string, depth: number): Promise<TreeNode[]> {
	if (depth > 16) return [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const subdirs: string[] = [];
	const files: TreeNode[] = [];
	for (const e of entries) {
		if (e.isDirectory()) {
			if (skipDir(e.name, TREE_IGNORE_DIRS)) continue;
			subdirs.push(e.name);
		} else {
			files.push({ name: e.name, path: join(dir, e.name), type: 'file' });
		}
	}
	// sibling dirs recurse in parallel (bounded naturally by the per-level fan-out)
	const dirs = await Promise.all(
		subdirs.map(async (name): Promise<TreeNode> => {
			const full = join(dir, name);
			return { name, path: full, type: 'dir', children: await treeBuild(full, depth + 1) };
		})
	);
	dirs.sort((a, b) => collator.compare(a.name, b.name));
	files.sort((a, b) => collator.compare(a.name, b.name));
	return [...dirs, ...files];
}

export async function tree(root: string): Promise<{ root: string; children: TreeNode[] }> {
	if (!root) throw new Error('Missing path');
	const children = await treeBuild(root, 0);
	return { root, children };
}

// tree + scan in ONE traversal, for the workspace-open path that used to walk the folder
// twice. The tree part keeps the permissive rules, the flat list keeps scan's aggressive
// rules and depth cap (a dir the tree shows but scan ignores contributes nodes, not files),
// so the result matches calling tree() and scan() separately.
async function treeScanWalk(
	dir: string,
	root: string,
	depth: number,
	exts: string[],
	acc: TexFile[],
	scanSkipped: boolean
): Promise<TreeNode[]> {
	if (depth > 16) return [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const collect = !scanSkipped && depth <= 12; // scanWalk stops at depth 12
	const subdirs: { name: string; skip: boolean }[] = [];
	const files: TreeNode[] = [];
	for (const e of entries) {
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			if (skipDir(e.name, TREE_IGNORE_DIRS)) continue;
			subdirs.push({ name: e.name, skip: scanSkipped || skipDir(e.name, SCAN_IGNORE_DIRS) });
		} else {
			files.push({ name: e.name, path: full, type: 'file' });
			if (collect && exts.some((ext) => e.name.toLowerCase().endsWith('.' + ext))) {
				acc.push({ name: e.name, path: full, relPath: full.slice(root.length).replace(/^[\\/]/, '') });
			}
		}
	}
	const dirs = await Promise.all(
		subdirs.map(async ({ name, skip }): Promise<TreeNode> => {
			const full = join(dir, name);
			return { name, path: full, type: 'dir', children: await treeScanWalk(full, root, depth + 1, exts, acc, skip) };
		})
	);
	dirs.sort((a, b) => collator.compare(a.name, b.name));
	files.sort((a, b) => collator.compare(a.name, b.name));
	return [...dirs, ...files];
}

/** tree() + scan() from a single walk -> { root, children, files }. */
export async function treeScan(root: string, extsCsv?: string): Promise<{ root: string; children: TreeNode[]; files: TexFile[] }> {
	if (!root) throw new Error('Missing path');
	const exts = parseExts(extsCsv);
	const files: TexFile[] = [];
	const children = await treeScanWalk(root, root, 0, exts, files, false);
	files.sort((a, b) => collator.compare(a.relPath, b.relPath));
	return { root, children, files };
}

export interface FsOpBody {
	action?: string;
	path?: string;
	type?: string;
	content?: string;
	from?: string;
	to?: string;
}

// reject names illegal on any target OS (enforced everywhere so projects stay portable): on
// Windows a ':' silently creates an NTFS alternate data stream, trailing dot/space and device names throw
const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
function validateName(name: string): void {
	if (!name || name === '.' || name === '..') throw new Error('Invalid file name');
	if (name.includes('/') || name.includes('\\')) throw new Error('File name cannot contain a slash');
	// eslint-disable-next-line no-control-regex
	if (/[<>:"|?*\x00-\x1f]/.test(name)) throw new Error('File name cannot contain any of < > : " | ? *');
	if (/[ .]$/.test(name)) throw new Error('File name cannot end with a space or a period');
	if (RESERVED_WIN.test(name)) throw new Error(`"${name}" is a reserved file name`);
}

export async function op(body: FsOpBody): Promise<{ ok: true }> {
	const action = body?.action;
	if (action === 'create') {
		const path = body.path;
		if (!path) throw new Error('Missing path');
		validateName(basename(path));
		if (body.type === 'dir') {
			await mkdir(path, { recursive: true });
		} else {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, body.content ?? '', { flag: 'wx' }); // wx: fail if exists
		}
	} else if (action === 'delete') {
		const path = body.path;
		if (!path) throw new Error('Missing path');
		await rm(path, { recursive: true, force: true });
	} else if (action === 'rename') {
		const { from, to } = body;
		if (!from || !to) throw new Error('Missing from/to');
		validateName(basename(to));
		await rename(from, to);
	} else if (action === 'copy') {
		// cross-window drag: files copied from another workspace (recursive for folders).
		// force:false so a raced-in destination is an error instead of a silent overwrite.
		const { from, to } = body;
		if (!from || !to) throw new Error('Missing from/to');
		validateName(basename(to));
		const src = resolve(from);
		const dest = resolve(to);
		if (dest === src || (dest + sep).startsWith(src + sep)) throw new Error('Cannot copy a folder into itself');
		await mkdir(dirname(dest), { recursive: true });
		await cp(src, dest, { recursive: true, force: false, errorOnExist: true });
	} else {
		throw new Error('Unknown action');
	}
	return { ok: true };
}

const BINARY_EXT =
	/\.(pdf|png|jpe?g|gif|svg|webp|bmp|ico|zip|gz|tar|otf|ttf|woff2?|eot|docx?|pptx?|xlsx?|bin|exe|dll|so|dylib|class|jar|wasm|synctex)$/i;
const MAX_FILE_BYTES = 2_000_000;
const MAX_RESULTS = 2000;

interface SearchState {
	total: number;
	truncated: boolean;
}

// tiny semaphore so ~n file reads are in flight at once (no dependency needed)
function limiter(n: number): <T>(fn: () => Promise<T>) => Promise<T> {
	let active = 0;
	const queue: (() => void)[] = [];
	return async (fn) => {
		if (active >= n) await new Promise<void>((r) => queue.push(r));
		active++;
		try {
			return await fn();
		} finally {
			active--;
			queue.shift()?.();
		}
	};
}

async function searchFile(
	full: string,
	root: string,
	test: (l: string) => boolean,
	out: SearchFileResult[],
	state: SearchState
): Promise<void> {
	if (state.total >= MAX_RESULTS) return;
	let size = 0;
	try {
		size = (await stat(full)).size;
	} catch {
		return;
	}
	if (size > MAX_FILE_BYTES) return;
	let content: string;
	try {
		content = await readFile(full, 'utf8');
	} catch {
		return;
	}
	if (content.includes(String.fromCharCode(0))) return; // a NUL byte: treat as binary
	const lines = content.split(/\r?\n/);
	const matches: { line: number; text: string }[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (test(lines[i])) {
			matches.push({ line: i + 1, text: lines[i].slice(0, 400) });
			if (++state.total >= MAX_RESULTS) {
				state.truncated = true;
				break;
			}
		}
	}
	if (matches.length) out.push({ file: full, rel: relative(root, full).split(sep).join('/'), matches });
}

async function searchDir(
	dir: string,
	root: string,
	test: (l: string) => boolean,
	out: SearchFileResult[],
	state: SearchState,
	run: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<void> {
	if (state.total >= MAX_RESULTS) return;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	const jobs: Promise<void>[] = [];
	for (const e of entries) {
		if (state.total >= MAX_RESULTS) {
			state.truncated = true;
			break;
		}
		const full = join(dir, e.name);
		if (e.isDirectory()) {
			if (skipDir(e.name, SCAN_IGNORE_DIRS)) continue;
			jobs.push(searchDir(full, root, test, out, state, run));
		} else if (e.isFile()) {
			if (BINARY_EXT.test(e.name)) continue;
			// the limiter bounds the file reads; dir listings are cheap enough to fan out freely
			jobs.push(run(() => searchFile(full, root, test, out, state)));
		}
	}
	await Promise.all(jobs);
}

export async function search(
	root: string,
	q: string,
	useRegex: boolean,
	caseSensitive: boolean
): Promise<{ results: SearchFileResult[]; truncated: boolean; total?: number; error?: string }> {
	if (!root || !q) return { results: [], truncated: false };
	let test: (l: string) => boolean;
	if (useRegex) {
		let re: RegExp;
		try {
			re = new RegExp(q, caseSensitive ? '' : 'i');
		} catch {
			return { results: [], truncated: false, error: 'Invalid regular expression' };
		}
		test = (l) => re.test(l);
	} else {
		const needle = caseSensitive ? q : q.toLowerCase();
		test = (l) => (caseSensitive ? l : l.toLowerCase()).includes(needle);
	}
	const out: SearchFileResult[] = [];
	const state: SearchState = { total: 0, truncated: false };
	await searchDir(root, root, test, out, state, limiter(8));
	// concurrent reads finish in nondeterministic order; sort so the result list is stable
	out.sort((a, b) => collator.compare(a.rel, b.rel));
	return { results: out, truncated: state.truncated, total: state.total };
}

// shell out to latexindent (ships with TeX Live/MiKTeX, same assumption as the compile command)
// rather than reimplement LaTeX-aware reindenting ourselves. runs next to the original file so a
// project-local .indentconfig.yaml/localSettings.yaml is picked up, same as latexindent's own CLI
// convention; the temp input + its indent.log are cleaned up either way.
export async function formatLatex(filePath: string, text: string): Promise<{ formatted: string }> {
	if (!filePath) throw new Error('Missing path');
	const dir = dirname(filePath);
	const tempFile = join(dir, `.texpile-format-${Date.now()}-${Math.random().toString(36).slice(2)}.tex`);
	const logFile = join(dir, 'indent.log');
	try {
		await writeFile(tempFile, text, 'utf-8');
		const stdout = await new Promise<string>((res, rej) => {
			execFile('latexindent', [tempFile], { cwd: dir, timeout: 20000, maxBuffer: 20 * 1024 * 1024 }, (err, out, stderr) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
						rej(new Error('latexindent was not found on PATH. It ships with most LaTeX distributions (TeX Live, MiKTeX).'));
					} else {
						rej(new Error(stderr?.trim() || err.message));
					}
					return;
				}
				res(out);
			});
		});
		if (!stdout.trim()) throw new Error('latexindent produced no output.');
		return { formatted: stdout };
	} finally {
		await rm(tempFile, { force: true }).catch(() => {});
		await rm(logFile, { force: true }).catch(() => {});
	}
}

// shell out to the synctex CLI rather than parse .synctex.gz ourselves; the fiddly coordinate
// math is its job, and it finds the .synctex(.gz) next to the PDF on its own
function runSynctex(args: string[]): Promise<string> {
	return new Promise((res, rej) => {
		execFile('synctex', args, { timeout: 10000, maxBuffer: 1 << 20 }, (err, stdout) => {
			// synctex exits non-zero on "no match" but still prints useful output; only reject on empty
			if (err && !stdout) rej(err);
			else res(stdout || '');
		});
	});
}

// synctex prints Key:Value records; take the first occurrence of each key (the best match)
function firstFields(out: string): Record<string, string> {
	const map: Record<string, string> = {};
	for (const line of out.split(/\r?\n/)) {
		const i = line.indexOf(':');
		if (i <= 0) continue;
		const k = line.slice(0, i).trim();
		if (!(k in map)) map[k] = line.slice(i + 1).trim();
	}
	return map;
}

// all result records ('Page:' starts a new one). Draft mode's instant patch needs every
// line box of the paragraph, not just the best match. Lowercase h/v are the BOX's own
// left/baseline (x/y are the sync point, which can sit mid-line); bl = box left, the
// column-exact anchor for the instant patch.
function allBoxes(out: string): { page: number; x: number; y: number; W: number; H: number; bl?: number }[] {
	const boxes: { page: number; x: number; y: number; W: number; H: number; bl?: number }[] = [];
	let cur: Record<string, number> | null = null;
	for (const line of out.split(/\r?\n/)) {
		const m = line.match(/^(Page|x|y|W|H|h):(.+)$/);
		if (!m) continue;
		if (m[1] === 'Page') {
			if (cur) boxes.push({ page: cur.Page, x: cur.x, y: cur.y, W: cur.W, H: cur.H, bl: cur.bl });
			cur = {};
		}
		if (cur) cur[m[1] === 'h' ? 'bl' : m[1]] = parseFloat(m[2]);
	}
	if (cur && cur.Page !== undefined) boxes.push({ page: cur.Page, x: cur.x, y: cur.y, W: cur.W, H: cur.H, bl: cur.bl });
	return boxes.filter((b) => Number.isFinite(b.page) && Number.isFinite(b.y));
}

export interface SynctexBody {
	action?: string;
	pdf?: string;
	tex?: string;
	line?: number;
	column?: number;
	page?: number;
	x?: number;
	y?: number;
}

export async function synctex(body: SynctexBody): Promise<Record<string, unknown>> {
	const pdf = String(body?.pdf ?? '');
	if (!pdf) return { ok: false, error: 'Missing pdf path' };
	try {
		if (body.action === 'view') {
			const tex = String(body.tex ?? '');
			const line = Number(body.line ?? 0);
			const col = Number(body.column ?? 0);
			const out = await runSynctex(['view', '-i', `${line}:${col}:${tex}`, '-o', pdf]);
			const f = firstFields(out);
			if (!f.Page) return { ok: false, error: 'No SyncTeX match. Compile with -synctex=1 first.' };
			return {
				ok: true,
				page: Number(f.Page),
				x: Number(f.x),
				y: Number(f.y),
				h: Number(f.h),
				v: Number(f.v),
				width: Number(f.W),
				height: Number(f.H),
				// every result record; Draft mode's instant patch needs the paragraph's full
				// extent (line boxes), not just the best match
				boxes: allBoxes(out)
			};
		}
		if (body.action === 'edit') {
			const page = Number(body.page ?? 1);
			const x = Number(body.x ?? 0);
			const y = Number(body.y ?? 0);
			const f = firstFields(await runSynctex(['edit', '-o', `${page}:${x}:${y}:${pdf}`]));
			if (!f.Input) return { ok: false, error: 'No SyncTeX match.' };
			// synctex's Input path often has a literal `/./` segment; unnormalized, the client treats it
			// as a different file and spuriously reloads. Relative inputs resolve against the PDF's dir,
			// then its parent for -output-directory layouts.
			let input = f.Input;
			if (isAbsolute(input)) {
				input = normalize(input);
			} else {
				const byPdf = resolve(dirname(pdf), input);
				input = existsSync(byPdf) ? byPdf : resolve(dirname(pdf), '..', input);
			}
			return { ok: true, input, line: Number(f.Line), column: Number(f.Column) };
		}
		return { ok: false, error: 'Unknown action' };
	} catch (e) {
		const code = (e as { code?: string })?.code;
		if (code === 'ENOENT') return { ok: false, error: 'The `synctex` tool was not found on PATH (install a TeX distribution).' };
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
