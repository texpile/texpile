// the open LaTeX file's reference problems, kept current as it is typed
import { box } from '$lib/runes/box.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { documentAround } from './documentFiles';
import { normalizePath, pathKey, relativeInside, samePath } from '../fileSystem';
import { checkRefs, documentFacts, type DocumentFacts, type RefProblem } from '$lib/languages/latex/refCheck';
import type { PackageUse } from '$lib/languages/latex/intellisense/packages/packageUses';
import { compileEngine, loadedPackages, type LoadedFile } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { checkIsOn } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import {
	LATEX_CHECKS,
	type DocumentPackageUse,
	type LatexCheckInput,
	type SourceProblem
} from '$lib/languages/latex/intellisense/checks/latexChecks';
import type { DefinedNames } from '$lib/languages/latex/intellisense/checks/reading/definedNames';
import { definedBesides, documentSources } from './documentSources';
import { conditionalUseNames, readingOf, usesInReadingOrder, type FileReading } from './readingOrder';
import { NO_OPTIONS, optionNamesOf, type OptionNames } from '$lib/languages/latex/intellisense/checks/reading/optionNames';
import { NO_POSSIBLE_NAMES, possibleNamesOf } from '$lib/languages/latex/intellisense/checks/reading/possibleNames';
import type { Engine } from '../compileCommand';

/** checks: what the LaTeX checks that are on found, besides the reference problems */
export type LiveRefProblems = { path: string; text: string; problems: RefProblem[]; checks: SourceProblem[] };

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

type Document = {
	path: string;
	main: string | null;
	facts: DocumentFacts | null;
	engine: Engine | null;
	/** what each file brings in and loads; the first is the file TeX starts from */
	parts: FileReading[];
	usesKey: string;
	loaded: LoadedFile[] | null;
	options: OptionNames;
	possible: ReadonlySet<string>;
	/** what the files besides the open one define; null when one could not be read */
	elsewhere: DefinedNames | null;
	/** the packages and classes whose file the folder holds */
	local: ReadonlySet<string>;
};

function readingsOf(
	files: readonly { path: string; text?: string; reads?: ReadonlyMap<string, string>; library?: boolean }[]
): FileReading[] {
	return files.flatMap((f) => (f.text === undefined || /\.typ$/i.test(f.path) ? [] : [readingOf(f.path, f.text, f.reads, f.library)]));
}

// what the checks need of the loaded files besides the files themselves
async function readLoaded(
	loaded: LoadedFile[] | null,
	parts: readonly FileReading[]
): Promise<{ options: OptionNames; possible: ReadonlySet<string> }> {
	if (!loaded) return { options: NO_OPTIONS, possible: NO_POSSIBLE_NAMES };
	const [options, possible] = await Promise.all([
		optionNamesOf(loaded).catch(() => NO_OPTIONS),
		possibleNamesOf(loaded, conditionalUseNames(parts)).catch(() => NO_POSSIBLE_NAMES)
	]);
	return { options, possible };
}

function plainUses(uses: readonly DocumentPackageUse[]): PackageUse[] {
	const seen = new Set<string>();
	return uses
		.map(({ path: _path, at: _at, ...use }) => use)
		.filter((use) => {
			const key = JSON.stringify(use);
			return !seen.has(key) && !!seen.add(key);
		});
}

/** the parts with the open file read from its live text */
function withOpenText(parts: readonly FileReading[], open: { path: string; text: string }): FileReading[] {
	const was = parts.find((p) => samePath(p.path, open.path));
	const now = readingOf(open.path, open.text, was?.reads);
	return was ? parts.map((p) => (p === was ? now : p)) : [now];
}

export class LiveRefChecks {
	private document: Document | null = null;
	private seq = 0;
	private reloadSeq = 0;
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
		const engine = compileEngine();
		let document: Document = {
			path: open.path,
			main: null,
			facts: null,
			engine,
			parts: [],
			usesKey: '',
			loaded: null,
			options: NO_OPTIONS,
			possible: NO_POSSIBLE_NAMES,
			elsewhere: null,
			local: new Set()
		};
		let around: Awaited<ReturnType<typeof documentAround>> = null;
		try {
			around = await documentAround(open.path, this.deps.main(), root, read);
			if (around) {
				const texts = around.files.flatMap((f) => (f.missing ? [] : [{ path: f.path, text: f.text }]));
				document = {
					...document,
					main: around.main,
					facts: await documentFacts(texts, open.path, around.main, root, this.deps.read, this.deps.readTexBib)
				};
			}
		} catch {
			/* nothing known about the document: the file is checked on its own */
		}
		// the files a preamble brings in load packages too
		const sources = around ? await documentSources(around.main, root, read) : null;
		const parts = readingsOf(sources?.files ?? around?.files ?? [{ path: openPath, text: openText }]);
		const uses = plainUses(usesInReadingOrder(parts));
		// the packages the document loads: checks wait for them
		const loaded = await loadedPackages(uses).catch(() => null);
		const elsewhere = definedBesides(sources, openPath);
		document = {
			...document,
			parts,
			usesKey: JSON.stringify(uses),
			loaded,
			...(await readLoaded(loaded, parts)),
			elsewhere,
			local: sources?.local ?? new Set()
		};
		if (my !== this.seq) return;
		this.document = document;
		this.check();
	}

	/** check the open file again once typing pauses */
	schedule(): () => void {
		this.checkSoon();
		return () => this.checkSoon.cancel();
	}

	// the packages the open file loads moved since the last read: read what they load, then check again
	private async reloadPackages(doc: Document, open: { path: string; text: string }): Promise<void> {
		const my = ++this.reloadSeq;
		const parts = withOpenText(doc.parts, open);
		const uses = plainUses(usesInReadingOrder(parts));
		const loaded = await loadedPackages(uses).catch(() => null);
		const read = await readLoaded(loaded, parts);
		if (my !== this.reloadSeq || this.document !== doc) return;
		this.document = { ...doc, parts, usesKey: JSON.stringify(uses), loaded, ...read };
		this.check();
	}

	private runChecks(open: { path: string; text: string }, doc: Document | null): SourceProblem[] {
		const on = LATEX_CHECKS.filter((c) => checkIsOn(c.id));
		if (!on.length || !doc?.loaded) return [];
		const parts = withOpenText(doc.parts, open);
		const uses = usesInReadingOrder(parts);
		if (JSON.stringify(plainUses(uses)) !== doc.usesKey) {
			void this.reloadPackages(doc, open);
			return [];
		}
		const input: LatexCheckInput = {
			text: open.text,
			path: open.path,
			main: doc.main,
			isMain: !!doc.main && samePath(doc.main, open.path),
			engine: doc.engine,
			loaded: doc.loaded,
			uses,
			elsewhere: doc.elsewhere,
			local: doc.local,
			options: doc.options,
			possible: doc.possible
		};
		return on.flatMap((c) => c.run(input));
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
		const have = new Set(files.map(pathKey));
		const problems = checkRefs(open.text, {
			path: open.path,
			main: doc?.main ?? null,
			root,
			facts: doc?.facts ?? null,
			exists: (p) => {
				const rel = files.length ? relativeInside(root, normalizePath(p)) : null;
				return rel === null ? null : have.has(pathKey(rel));
			},
			knownKeys: this.deps.knownKeys(),
			outDir: this.deps.outDir()
		});
		liveRefProblems.current = { path: open.path, text: open.text, problems, checks: this.runChecks(open, doc) };
	}

	destroy(): void {
		this.seq++;
		this.reloadSeq++;
		this.checkSoon.cancel();
		liveRefProblems.current = null;
	}
}
