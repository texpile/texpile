// the open LaTeX file's reference problems, kept current as it is typed
import { box } from '$lib/runes/box.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { documentAround } from './documentFiles';
import { normalizePath, relativeInside, samePath } from '../fileSystem';
import { checkRefs, documentFacts, type DocumentFacts, type RefProblem } from '$lib/languages/latex/refCheck';

export type LiveRefProblems = { path: string; text: string; problems: RefProblem[] };

/** the problems with the text they were found in; null with no LaTeX file open */
export const liveRefProblems = box<LiveRefProblems | null>(null);

export type LiveRefDeps = {
	read: (path: string) => Promise<string>;
	/** the open file and its live text, or null when no LaTeX file is open */
	open: () => { path: string; text: string } | null;
	main: () => string | null;
	root: () => string | null;
	/** the project's files, relative to the root; empty until the tree is read */
	files: () => readonly string[];
	/** keys the folder's .bib and .bbl files hold */
	knownKeys: () => ReadonlySet<string>;
	/** the compile's output folder, from the main file's folder */
	outDir: () => string;
	/** a .bib from the TeX installation by bare name; null when it has none */
	readTexBib: (name: string) => Promise<string | null>;
};

type Document = { path: string; main: string | null; facts: DocumentFacts | null };

export class LiveRefChecks {
	private document: Document | null = null;
	private seq = 0;
	private checkSoon = trailingDebounce<void>(400, () => this.check());

	constructor(private deps: LiveRefDeps) {}

	/** the document the open file belongs to, and what its other files hold, read again */
	async refresh(): Promise<void> {
		const my = ++this.seq;
		const open = this.deps.open();
		const root = this.deps.root();
		if (!open || !root) {
			this.document = null;
			liveRefProblems.current = null;
			return;
		}
		const deps = this.deps;
		const { path: openPath, text: openText } = open;
		// the open file's includes as they are now, not as last saved
		function read(p: string): Promise<string> {
			return samePath(p, openPath) ? Promise.resolve(openText) : deps.read(p);
		}
		let document: Document = { path: open.path, main: null, facts: null };
		try {
			const around = await documentAround(open.path, this.deps.main(), root, read);
			if (around) {
				const texts = around.files.flatMap((f) => (f.missing ? [] : [{ path: f.path, text: f.text }]));
				document = {
					path: open.path,
					main: around.main,
					facts: await documentFacts(texts, open.path, around.main, root, this.deps.read, this.deps.readTexBib)
				};
			}
		} catch {
			/* nothing known about the document: the file is checked on its own */
		}
		if (my !== this.seq) return;
		this.document = document;
		this.check();
	}

	/** check the open file again once typing pauses */
	schedule(): () => void {
		this.checkSoon();
		return () => this.checkSoon.cancel();
	}

	private check(): void {
		const open = this.deps.open();
		const root = this.deps.root();
		if (!open || !root) {
			liveRefProblems.current = null;
			return;
		}
		const doc = this.document && samePath(this.document.path, open.path) ? this.document : null;
		const files = this.deps.files();
		const have = new Set(files.map((f) => f.replace(/\\/g, '/').toLowerCase()));
		const problems = checkRefs(open.text, {
			path: open.path,
			main: doc?.main ?? null,
			root,
			facts: doc?.facts ?? null,
			exists: (p) => {
				const rel = files.length ? relativeInside(root, normalizePath(p)) : null;
				return rel === null ? null : have.has(rel.toLowerCase());
			},
			knownKeys: this.deps.knownKeys(),
			outDir: this.deps.outDir()
		});
		liveRefProblems.current = { path: open.path, text: open.text, problems };
	}

	destroy(): void {
		this.seq++;
		this.checkSoon.cancel();
		liveRefProblems.current = null;
	}
}
