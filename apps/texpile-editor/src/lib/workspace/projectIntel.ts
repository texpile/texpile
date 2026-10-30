// the cross-file scan behind projectIntelStore: reads every project .tex (except the active
// buffer, whose live text the editor owns), the .bib files, and the main file's .aux, and
// derives what completion/hover/definition/outline need. see stores/projectIntel.ts for types.
import { typstOutline } from '$lib/languages/typst/outline';
import { typstTreeOf } from '$lib/languages/typst/syntax/typstTrees';
import { includedFiles } from '$lib/languages/typst/syntax/typstIncludes';
import { dirname, joinPath, pathKey, samePath, type TexFile } from './fileSystem';
import { hasDocumentEnv } from './latexRoundtrip';
import { parseAuxLabels, type AuxLabels } from './auxLabels';
import { parseAuxContents } from '$lib/editor/visual/extensions/tableofcontents/compiled/auxContents';
import type { CompiledEntry } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';
import {
	projectIntelStore,
	EMPTY_PROJECT_INTEL,
	NO_DOCUMENT_FILES,
	type DocumentFiles,
	type ProjectIntel,
	type TypstOutline
} from '$lib/stores/projectIntel';
import { scanGlossary } from '$lib/languages/latex/intellisense/completion/glossary';
import { scanScripts } from '$lib/languages/latex/intellisense/completion/subsuperscript';
import { scanMacroBodies } from '$lib/editor/source/extensions/math-preview/userMacros';
import { parseOutlineRaw } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';
import { definedIn, ownLiteralsIn, signatureOf } from '$lib/languages/latex/userDefinitions';
import type { OwnLiterals } from '$lib/languages/latex/syntax/tokens/ownSyntax';
import { keysIn } from '$lib/languages/latex/knowledge/calls/roleKeys';
import { blankComments, codeOnly } from '$lib/languages/latex/texCode';
import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { packageUsesIn, type PackageUse } from '$lib/languages/latex/intellisense/packages/packageUses';
import { isBundled } from '$lib/languages/latex/knowledge/bundledFiles';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { fileIdOf } from '$lib/languages/latex/knowledge/fileIds';
import { includePaths, readFirst, texIncludesIn } from './document/texIncludes';
import { exceedsTextLimit } from '$lib/files/service/textLimit';
import { FileIndex } from '$lib/files/index/fileIndex';
import { indexedText } from '$lib/files/index/indexedTexts';
import { fileService } from '$lib/files/service/fileService';
import {
	PLAIN_NUMBERING,
	footnotesInBibliographyOf,
	numberingSchemeOf
} from '$lib/languages/latex/visual/extensions/numbers/numberingScheme';
import { definesFootnoteIn } from '$lib/languages/latex/visual/extensions/numbers/definedForms';
import { loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';

const MAX_FILES = 300;

const BIB_ENTRY_RE = /^\s*@[a-zA-Z]+\s*\{\s*([^\s,{}]+)\s*,/gm;

function lineStartsOf(text: string): number[] {
	const lineStarts = [0];
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
	return lineStarts;
}

function lineIn(lineStarts: number[], pos: number): number {
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (lineStarts[mid] <= pos) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
}

// a package file leaves out its internals, the names with an @
function scanDefinitions(
	code: string,
	file: string,
	draft: Pick<ProjectIntel, 'macros' | 'envs'>,
	lineStarts: number[],
	packageFile: boolean
) {
	function lineOf(pos: number): number {
		return lineIn(lineStarts, pos);
	}
	const firstMacro = draft.macros.length;
	for (const d of definedIn(code, 'macro'))
		if (!packageFile || !d.name.includes('@'))
			draft.macros.push({ name: d.name, signature: signatureOf(d.args), file, line: lineOf(d.at) });
	// replacement bodies for this file's macros, so math previews can expand them cross-file
	const bodies = scanMacroBodies(code);
	for (let i = firstMacro; i < draft.macros.length; i++) {
		const body = bodies[draft.macros[i].name];
		if (body) {
			draft.macros[i].definition = body.def;
			draft.macros[i].argCount = body.args;
			draft.macros[i].optional = body.optional;
		}
	}
	for (const d of definedIn(code, 'environment'))
		if (!packageFile || !d.name.includes('@'))
			draft.envs.push({
				name: d.name,
				signature: signatureOf(d.args),
				file,
				line: lineOf(d.at),
				...(d.body !== undefined ? { definition: d.body, end: d.end ?? '' } : {})
			});
}

type TexFacts = Pick<ProjectIntel, 'labels' | 'macros' | 'envs' | 'literals' | 'sub' | 'sup'> & {
	outline: ProjectIntel['outlines'][string];
};

const texFacts = new FileIndex<TexFacts>((file, text) => {
	const lineStarts = lineStartsOf(text);
	function contextAt(pos: number): string {
		const line = lineIn(lineStarts, pos);
		const from = lineStarts[Math.max(0, line - 2)];
		const to = (lineStarts[Math.min(lineStarts.length - 1, line + 1)] ?? text.length) - 1;
		return text.slice(from, Math.min(to < from ? text.length : to, from + 500));
	}
	const code = codeOnly(text);
	const labels = keysIn(code, 'label', true).map((label) => ({
		name: label.key,
		file,
		line: lineIn(lineStarts, label.call.at),
		context: contextAt(label.call.at)
	}));
	const definitions: Pick<ProjectIntel, 'macros' | 'envs'> = { macros: [], envs: [] };
	scanDefinitions(code, file, definitions, lineStarts, false);
	const scripts = scanScripts(text);
	return { labels, ...definitions, literals: ownLiteralsIn(code), sub: scripts.sub, sup: scripts.sup, outline: parseOutlineRaw(text) };
});

const loadedKeys = new WeakMap<LoadedFile[], string>();
let loadedCount = 0;
// loadedPackages hands the same array for the same packages
function loadedKey(loaded: LoadedFile[]): string {
	let key = loadedKeys.get(loaded);
	if (!key) loadedKeys.set(loaded, (key = String(++loadedCount)));
	return key;
}

const glossaryFacts = new FileIndex<ProjectIntel['glossary'], LoadedFile[]>(
	(file, text, loaded) => scanGlossary(text, loaded).map((g) => ({ ...g, file })),
	loadedKey
);

const shippedFacts = new FileIndex<Pick<ProjectIntel, 'macros' | 'envs' | 'literals'>>((file, text) => {
	const definitions: Pick<ProjectIntel, 'macros' | 'envs'> = { macros: [], envs: [] };
	const code = codeOnly(text);
	scanDefinitions(code, file, definitions, lineStartsOf(text), true);
	return { ...definitions, literals: ownLiteralsIn(code) };
});

function addLiterals(into: OwnLiterals, from: OwnLiterals): void {
	into.unread.push(...from.unread);
	into.read.push(...from.read);
	into.verbatimCommands.push(...from.verbatimCommands);
}

const bibFacts = new FileIndex<ProjectIntel['bibEntries']>((file, text) => {
	const entries: ProjectIntel['bibEntries'] = [];
	BIB_ENTRY_RE.lastIndex = 0;
	// lines counted on from the last entry: from the top each time took half a minute on a 2 MB .bib
	let line = 1;
	let counted = 0;
	for (let m = BIB_ENTRY_RE.exec(text); m; m = BIB_ENTRY_RE.exec(text)) {
		const at = m.index + m[0].indexOf('@');
		for (let i = text.indexOf('\n', counted); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) line++;
		counted = at;
		entries.push({ key: m[1], file, line });
	}
	return entries;
});

const packageUseFacts = new FileIndex<PackageUse[]>((_file, text) => packageUsesIn(text));

const includeFacts = new FileIndex<ReturnType<typeof texIncludesIn>>((_file, text) => texIncludesIn(blankComments(text)));

function takeLabels(draft: ProjectIntel, { numbers, pages, kinds, titles, repeated }: AuxLabels): void {
	draft.auxRepeated.push(...repeated, ...Object.keys(numbers).filter((label) => label in draft.auxNumbers));
	Object.assign(draft.auxNumbers, numbers);
	Object.assign(draft.auxPages, pages);
	Object.assign(draft.auxKinds, kinds);
	Object.assign(draft.auxTitles, titles);
}

async function readAux(auxPath: string, draft: ProjectIntel, read: (p: string) => Promise<string>) {
	let aux: string;
	try {
		aux = await read(auxPath);
	} catch {
		return; // never compiled (or aux elsewhere): completion just shows no numbers
	}
	takeLabels(draft, parseAuxLabels(aux));
	draft.auxContents = await auxContentsOf(aux, auxPath, read, new Set([auxPath]), draft);
}

/** the compile's Contents, an \include'd file's .aux read in where the main one names it, with its labels */
async function auxContentsOf(
	aux: string,
	auxPath: string,
	read: (p: string) => Promise<string>,
	seen: Set<string>,
	draft: ProjectIntel
): Promise<CompiledEntry[]> {
	const out: CompiledEntry[] = [];
	for (const part of parseAuxContents(aux)) {
		if (!('include' in part)) {
			out.push(part);
			continue;
		}
		const path = auxPath.replace(/[^/\\]*$/, '') + part.include;
		if (seen.has(path) || seen.size > 200) continue;
		seen.add(path);
		const included = await read(path).catch(() => null);
		if (included === null) continue;
		takeLabels(draft, parseAuxLabels(included));
		out.push(...(await auxContentsOf(included, path, read, seen, draft)));
	}
	return out;
}

/** a .typ's headings with the lines a jump into it needs, and its #include spots */
export async function typstOutlineOf(text: string): Promise<TypstOutline> {
	const starts = [0];
	for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
	function lineAt(pos: number): number {
		return starts.findLastIndex((s) => s <= pos) + 1;
	}
	const tree = await typstTreeOf(text);
	const items = typstOutline(tree, text).map((i) => ({ ...i, line: lineAt(i.pos) }));
	return { items, includes: includedFiles(tree, text) };
}

// what the open document loads: its own tree when it starts a document, else the main file's, and the packages and
// classes the project ships among them, whose commands complete like the document's own; preamble: the texts of the files
// the main file's preamble reads in, which define what the body uses
async function documentPackageUses(
	start: string,
	root: string,
	read: (p: string) => Promise<string>
): Promise<{ uses: PackageUse[]; shipped: { path: string; text: string }[]; readIn: DocumentFiles['texts']; preamble: string[] }> {
	const out: PackageUse[] = [];
	const shippedFiles: { path: string; text: string }[] = [];
	const readIn: Record<string, { path: string; text: string }> = {};
	const preamble: string[] = [];
	const seen = new Set<string>();
	async function walk(path: string, text: string, depth: number, inPreamble: boolean): Promise<void> {
		if (seen.has(pathKey(path)) || exceedsTextLimit(text)) return;
		seen.add(pathKey(path));
		const uses = packageUseFacts.get(path, text);
		out.push(...uses);
		if (depth >= 6) return;
		for (const use of uses) {
			if (!use.file || isBundled(fileIdOf(use.name))) continue;
			const shipped = await readFirst(
				[dirname(path), root].map((base) => joinPath(base, use.file ?? '')),
				read
			);
			if (!shipped) continue;
			if (!seen.has(pathKey(shipped.path)) && !exceedsTextLimit(shipped.text)) shippedFiles.push(shipped);
			await walk(shipped.path, shipped.text, depth + 1, false);
		}
		const bodyAt = depth === 0 ? (documentWrapperOf(text)?.begin.from ?? Infinity) : Infinity;
		for (const include of includeFacts.get(path, text)) {
			const included = await readFirst(includePaths(include, dirname(path), [dirname(path), root]), read);
			if (!included) continue;
			readIn[pathKey(included.path)] = included;
			const fromPreamble = inPreamble && include.at < bodyAt;
			if (fromPreamble && !seen.has(pathKey(included.path))) preamble.push(included.text);
			await walk(included.path, included.text, depth + 1, fromPreamble);
		}
	}
	const text = await read(start).catch(() => null);
	if (text !== null) {
		readIn[pathKey(start)] = { path: start, text };
		await walk(start, text, 0, true);
	}
	return { uses: out, shipped: shippedFiles, readIn, preamble };
}

let scanToken = 0;

/**
 * rescan the project into projectIntelStore. cheap enough to run on file-list / main-file /
 * active-file changes (local reads of small files); the active buffer is excluded because the
 * completion sources read it live.
 */
export async function refreshProjectIntel(
	texFiles: TexFile[],
	bibPaths: string[],
	auxPath: string | null,
	activePath: string | null,
	// injectable so a guest session reads through its provider (files live in the shared doc)
	read: (p: string) => Promise<string> = (p) => fileService.readText(p),
	// a guest has no .aux on disk; the host shares its parsed label numbers instead
	auxOverride?: {
		numbers: Record<string, string>;
		pages: Record<string, string>;
		kinds?: Record<string, string>;
		titles?: Record<string, string>;
		contents?: CompiledEntry[];
	} | null,
	// whose tree gives the packages when the open file is a fragment
	mainPath: string | null = null
): Promise<void> {
	const token = ++scanToken;
	const into: ProjectIntel = {
		...EMPTY_PROJECT_INTEL,
		labels: [],
		macros: [],
		envs: [],
		literals: { unread: [], read: [], verbatimCommands: [] },
		packages: [],
		glossary: [],
		bibEntries: [],
		sub: [],
		sup: [],
		auxNumbers: {},
		auxPages: {},
		auxKinds: {},
		auxTitles: {},
		auxRepeated: [],
		auxContents: [],
		numbering: PLAIN_NUMBERING,
		documentFiles: NO_DOCUMENT_FILES,
		outlines: {},
		typstOutlines: {}
	};

	const texTargets = texFiles.filter((f) => !activePath || !samePath(f.path, activePath)).slice(0, MAX_FILES);
	function readIndexed(p: string): Promise<string> {
		return indexedText(p, read);
	}
	const active = activePath ? await readIndexed(activePath).catch(() => null) : null;
	const start = activePath && active !== null && hasDocumentEnv(active) ? activePath : mainPath;
	const root = texFiles[0] ? texFiles[0].path.slice(0, texFiles[0].path.length - texFiles[0].relPath.length) : '';
	const { uses, shipped, readIn, preamble } = start
		? await documentPackageUses(start, root, readIndexed)
		: { uses: [], shipped: [], readIn: {}, preamble: [] };
	into.documentFiles = { start, root, texts: readIn };
	into.packages.push(...uses);
	for (const file of shipped) {
		const definitions = shippedFacts.get(file.path, file.text);
		into.macros.push(...definitions.macros);
		into.envs.push(...definitions.envs);
		addLiterals(into.literals, definitions.literals);
	}
	const loaded = await loadedPackages(into.packages);
	const startText = start ? await readIndexed(start).catch(() => '') : '';
	into.numbering = numberingSchemeOf(
		loadedRegistry(loaded, 'counters'),
		loadedRegistry(loaded, 'counterForms'),
		startText,
		footnotesInBibliographyOf(loaded) || shipped.some((f) => definesFootnoteIn(f.text)),
		shipped.map((f) => f.text),
		preamble
	);
	const texts = await Promise.all(texTargets.map((f) => readIndexed(f.path).catch(() => null)));
	for (const [i, f] of texTargets.entries()) {
		const text = texts[i];
		if (text === null) continue;
		if (!exceedsTextLimit(text)) {
			const facts = texFacts.get(f.path, text);
			into.labels.push(...facts.labels);
			into.macros.push(...facts.macros);
			into.envs.push(...facts.envs);
			addLiterals(into.literals, facts.literals);
			into.glossary.push(...glossaryFacts.get(f.path, text, loaded));
			into.sub.push(...facts.sub);
			into.sup.push(...facts.sup);
			into.outlines[f.path] = facts.outline;
		}
		const typstOutline = /\.typ$/i.test(f.path) ? await typstOutlineOf(text).catch(() => null) : null;
		if (typstOutline) into.typstOutlines[f.path] = typstOutline;
	}
	const bibs = bibPaths.slice(0, MAX_FILES);
	const bibTexts = await Promise.all(bibs.map((path) => readIndexed(path).catch(() => null)));
	for (const [i, path] of bibs.entries()) {
		const text = bibTexts[i];
		if (text !== null) into.bibEntries.push(...bibFacts.get(path, text));
	}
	if (auxOverride) {
		Object.assign(into.auxNumbers, auxOverride.numbers);
		Object.assign(into.auxPages, auxOverride.pages);
		Object.assign(into.auxKinds, auxOverride.kinds ?? {});
		Object.assign(into.auxTitles, auxOverride.titles ?? {});
		into.auxContents = auxOverride.contents ?? [];
	} else if (auxPath) await readAux(auxPath, into, read);

	// dedupe the repetition-mining pools
	into.sub = [...new Set(into.sub)];
	into.sup = [...new Set(into.sup)];

	if (token === scanToken) projectIntelStore.current = into;
}
