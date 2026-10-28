// find-in-files over a workspace: plain or regex, bounded by size and result caps
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { SCAN_IGNORE_DIRS, skipDir } from './walkIgnoreRules';
import { collator } from './nameCollator';

export type SearchFileResult = {
	file: string;
	rel: string;
	matches: { line: number; text: string }[];
};

const BINARY_EXT =
	/\.(pdf|png|jpe?g|gif|svg|webp|bmp|ico|zip|gz|tar|otf|ttf|woff2?|eot|docx?|pptx?|xlsx?|bin|exe|dll|so|dylib|class|jar|wasm|synctex)$/i;
// the renderer's MAX_TEXT_BYTES, so search covers every editable file
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_RESULTS = 2000;

type SearchState = {
	total: number;
	truncated: boolean;
};

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

/* eslint-disable no-param-reassign -- the shared SearchState counters are the cross-walker result budget */
async function searchFile(
	full: string,
	root: string,
	test: (l: string) => boolean,
	out: SearchFileResult[],
	state: SearchState
): Promise<void> {
	if (state.total >= MAX_RESULTS) return;
	let size: number;
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
/* eslint-enable no-param-reassign */

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
