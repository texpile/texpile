// the cross-file scan behind projectIntelStore: reads every project .tex (except the active
// buffer, whose live text the editor owns), the .bib files, and the main file's .aux, and
// derives what completion/hover/definition/outline need. see stores/projectIntel.ts for types.
import { typstSourceOutline } from '$lib/languages/typst/outline';
import { dirname, joinPath, pathKey, readTextFile, samePath, type TexFile } from './fileSystem';
import { hasDocumentEnv } from './latexRoundtrip';
import { parseAuxLabels } from './auxLabels';
import { parseAuxContents } from '$lib/editor/visual/extensions/tableofcontents/compiled/auxContents';
import type { CompiledEntry } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';
import { projectIntelStore, EMPTY_PROJECT_INTEL, type ProjectIntel, type TypstOutline } from '$lib/stores/projectIntel';
import { scanGlossary } from '$lib/languages/latex/intellisense/completion/glossary';
import { scanScripts } from '$lib/languages/latex/intellisense/completion/subsuperscript';
import { scanMacroBodies } from '$lib/editor/source/extensions/math-preview/userMacros';
import { parseOutlineRaw } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';
import { definedIn, signatureOf } from '$lib/languages/latex/userDefinitions';
import { keysIn } from '$lib/languages/latex/knowledge/calls/roleKeys';
import { codeOnly } from '$lib/languages/latex/texCode';
import { packageUsesIn, withoutComments, type PackageUse } from '$lib/languages/latex/intellisense/packages/packageUses';
import { isBundled } from '$lib/languages/latex/knowledge/bundledFiles';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { fileIdOf } from '$lib/languages/latex/knowledge/fileIds';
import { includePaths, readFirst, texIncludesIn } from './document/texIncludes';

const MAX_FILES = 300;
const MAX_FILE_LENGTH = 2_000_000;

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
function scanDefinitions(code: string, file: string, draft: ProjectIntel, lineStarts: number[], packageFile: boolean) {
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

function scanTexIntel(text: string, file: string, draft: ProjectIntel, loaded: LoadedFile[]) {
	if (text.length > MAX_FILE_LENGTH) return;
	const lineStarts = lineStartsOf(text);
	function contextAt(pos: number): string {
		const line = lineIn(lineStarts, pos);
		const from = lineStarts[Math.max(0, line - 2)];
		const to = (lineStarts[Math.min(lineStarts.length - 1, line + 1)] ?? text.length) - 1;
		return text.slice(from, Math.min(to < from ? text.length : to, from + 500));
	}

	const code = codeOnly(text);
	for (const label of keysIn(code, 'label', true)) {
		draft.labels.push({ name: label.key, file, line: lineIn(lineStarts, label.call.at), context: contextAt(label.call.at) });
	}
	scanDefinitions(code, file, draft, lineStarts, false);
	for (const g of scanGlossary(text, loaded)) draft.glossary.push({ ...g, file });
	const scripts = scanScripts(text);
	draft.sub.push(...scripts.sub);
	draft.sup.push(...scripts.sup);
	draft.outlines[file] = parseOutlineRaw(text);
}

async function readAux(auxPath: string, draft: ProjectIntel, read: (p: string) => Promise<string>) {
	let aux: string;
	try {
		aux = await read(auxPath);
	} catch {
		return; // never compiled (or aux elsewhere): completion just shows no numbers
	}
	const { numbers, pages, kinds, titles } = parseAuxLabels(aux);
	Object.assign(draft.auxNumbers, numbers);
	Object.assign(draft.auxPages, pages);
	Object.assign(draft.auxKinds, kinds);
	Object.assign(draft.auxTitles, titles);
	draft.auxContents = await auxContentsOf(aux, auxPath, read, new Set([auxPath]));
}

/** the compile's Contents, an \include'd file's .aux read in where the main one names it */
async function auxContentsOf(
	aux: string,
	auxPath: string,
	read: (p: string) => Promise<string>,
	seen: Set<string>
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
		if (included !== null) out.push(...(await auxContentsOf(included, path, read, seen)));
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
	const items = (await typstSourceOutline(text)).map((i) => ({ ...i, line: lineAt(i.pos) }));
	const includes = [...text.matchAll(/#include\s+"([^"]+)"/g)].map((m) => ({ pos: m.index ?? 0, target: m[1] }));
	return { items, includes };
}

// what the open document loads: its own tree when it starts a document, else the main file's, and the packages and
// classes the project ships among them, whose commands complete like the document's own
async function documentPackageUses(
	start: string,
	root: string,
	read: (p: string) => Promise<string>
): Promise<{ uses: PackageUse[]; shipped: { path: string; text: string }[] }> {
	const out: PackageUse[] = [];
	const shippedFiles: { path: string; text: string }[] = [];
	const seen = new Set<string>();
	async function walk(path: string, text: string, depth: number): Promise<void> {
		if (seen.has(pathKey(path)) || text.length > MAX_FILE_LENGTH) return;
		seen.add(pathKey(path));
		const uses = packageUsesIn(text);
		out.push(...uses);
		if (depth >= 6) return;
		for (const use of uses) {
			if (!use.file || isBundled(fileIdOf(use.name))) continue;
			const shipped = await readFirst(
				[dirname(path), root].map((base) => joinPath(base, use.file ?? '')),
				read
			);
			if (!shipped) continue;
			if (!seen.has(pathKey(shipped.path)) && shipped.text.length <= MAX_FILE_LENGTH) shippedFiles.push(shipped);
			await walk(shipped.path, shipped.text, depth + 1);
		}
		for (const include of texIncludesIn(withoutComments(text))) {
			const included = await readFirst(includePaths(include, dirname(path), [dirname(path), root]), read);
			if (included) await walk(included.path, included.text, depth + 1);
		}
	}
	const text = await read(start).catch(() => null);
	if (text !== null) await walk(start, text, 0);
	return { uses: out, shipped: shippedFiles };
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
	read: (p: string) => Promise<string> = readTextFile,
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
		packages: [],
		glossary: [],
		bibEntries: [],
		sub: [],
		sup: [],
		auxNumbers: {},
		auxPages: {},
		auxKinds: {},
		auxTitles: {},
		auxContents: [],
		outlines: {},
		typstOutlines: {}
	};

	const texTargets = texFiles.filter((f) => !activePath || !samePath(f.path, activePath)).slice(0, MAX_FILES);
	const active = activePath ? await read(activePath).catch(() => null) : null;
	const start = activePath && active !== null && hasDocumentEnv(active) ? activePath : mainPath;
	const root = texFiles[0] ? texFiles[0].path.slice(0, texFiles[0].path.length - texFiles[0].relPath.length) : '';
	const { uses, shipped } = start ? await documentPackageUses(start, root, read) : { uses: [], shipped: [] };
	into.packages.push(...uses);
	for (const file of shipped) scanDefinitions(codeOnly(file.text), file.path, into, lineStartsOf(file.text), true);
	const loaded = await loadedPackages(into.packages);
	await Promise.all(
		texTargets.map(async (f) => {
			try {
				const text = await read(f.path);
				scanTexIntel(text, f.path, into, loaded);
				if (/\.typ$/i.test(f.path)) into.typstOutlines[f.path] = await typstOutlineOf(text);
			} catch {
				/* unreadable file: skip */
			}
		})
	);
	await Promise.all(
		bibPaths.slice(0, MAX_FILES).map(async (path) => {
			try {
				const text = await read(path);
				BIB_ENTRY_RE.lastIndex = 0;
				// lines counted on from the last entry: from the top each time took half a minute on a 2 MB .bib
				let line = 1;
				let counted = 0;
				for (let m = BIB_ENTRY_RE.exec(text); m; m = BIB_ENTRY_RE.exec(text)) {
					const at = m.index + m[0].indexOf('@');
					for (let i = text.indexOf('\n', counted); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) line++;
					counted = at;
					into.bibEntries.push({ key: m[1], file: path, line });
				}
			} catch {
				/* unreadable file: skip */
			}
		})
	);
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
