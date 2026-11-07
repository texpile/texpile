// the names the open Typst file imports and binds, for the faces that draw a call as what it prints
import { box } from '$lib/runes/box.svelte';
import { loadPackage, loadedPackage, typstFileScope, type PackageCacheReader, type TypstFileScope } from '../../../knowledge';
import { changedLets, readFileLets, type FileLets } from './fileLets';
import { projectScope, projectTexts, type ProjectFiles } from './projectScope';

export type { ProjectFiles } from './projectScope';

export const typstScopeNow = box<TypstFileScope | null>(null);
export const typstNamesNow = box(0);

export type TypstExpansion = { scope: TypstFileScope; caller: TypstFileScope; args: string[]; body: string };

const expansions: TypstExpansion[] = [];

export function typstScopeOfDrawing(written = ''): TypstFileScope | null {
	for (const e of expansions) if (written && !e.body.includes(written) && e.args.some((arg) => arg.includes(written))) return e.caller;
	return expansions.at(-1)?.scope ?? typstScopeNow.current;
}

export function drawExpansion<T>(expansion: TypstExpansion, draw: () => T): T {
	expansions.push(expansion);
	try {
		return draw();
	} finally {
		expansions.pop();
	}
}

type ScopeBuilder = (source: string) => TypstFileScope;
type ProjectTexts = Map<string, string | null>;

const IMPORT = /^[ \t]*#?import\b[^\n]*/gm;
const SPEC = /"(@[\w-]+\/[\w-]+:\d+\.\d+\.\d+)"/g;

function specsIn(source: string): string[] {
	return [...(source.match(IMPORT) ?? []).join('\n').matchAll(SPEC)].map((m) => m[1]);
}

async function builderOf(
	source: string,
	texts: ProjectTexts,
	cache: PackageCacheReader | null,
	project?: ProjectFiles
): Promise<ScopeBuilder> {
	const specs = new Set([source, ...texts.values()].flatMap((text) => (text ? specsIn(text) : [])));
	await Promise.all([...specs].map((spec) => loadPackage(spec, cache)));
	return project ? projectScope(project, texts) : (text) => typstFileScope(text, loadedPackage);
}

async function textsOf(source: string, project?: ProjectFiles): Promise<ProjectTexts> {
	return project ? projectTexts(source, project) : new Map();
}

export async function scopeOfFile(source: string, cache: PackageCacheReader | null, project?: ProjectFiles): Promise<TypstFileScope> {
	return (await builderOf(source, await textsOf(source, project), cache, project))(source);
}

export type ChangedLets = ReadonlySet<string> | null;
const redraws = new Set<(changed: ChangedLets) => void>();

export function onTypstScope(redraw: (changed: ChangedLets) => void): () => void {
	redraws.add(redraw);
	return () => redraws.delete(redraw);
}

function publish(scope: TypstFileScope, changed: ChangedLets): void {
	typstScopeNow.current = scope;
	redraws.forEach((redraw) => redraw(changed));
}

const awaited = new Set<string>();

export function awaitTypstLets(names: Iterable<string>): void {
	for (const name of names) awaited.add(name);
}

const PAUSE_MS = 250;
let soon: ReturnType<typeof setTimeout> | null = null;

function redrawEveryChip(): void {
	if (soon) clearTimeout(soon);
	soon = null;
	awaited.clear();
	typstNamesNow.current++;
}

export function redrawEveryTypstChipSoon(): void {
	if (soon) clearTimeout(soon);
	soon = setTimeout(redrawEveryChip, PAUSE_MS);
}

type Followed = { key: string; cache: PackageCacheReader | null; project?: ProjectFiles; texts: ProjectTexts; build: ScopeBuilder | null };

let followed: Followed | null = null;
let lets: FileLets = readFileLets('');
let latest = '';

async function readProject(at: Followed): Promise<void> {
	const texts = await textsOf(latest, at.project);
	if (at.build && [...texts].every(([path, text]) => at.texts.get(path) === text) && texts.size === at.texts.size) return;
	const build = await builderOf(latest, texts, at.cache, at.project);
	if (followed !== at) return;
	followed = { ...at, texts, build };
	lets = readFileLets(latest);
	publish(build(latest), null);
	redrawEveryChip();
}

export function followTypstImports(source: string, cache: PackageCacheReader | null, project?: ProjectFiles): void {
	latest = source;
	const now = readFileLets(source);
	const key = [project?.path ?? '', project?.main ?? '', now.imports].join('\n');
	if (key !== followed?.key) {
		lets = now;
		followed = { key, cache, project, texts: new Map(), build: null };
		void readProject(followed);
		return;
	}
	followed.cache = cache;
	followed.project = project;
	if (!followed.build) return;
	const changed = changedLets(lets, now);
	if (!changed.size) return;
	const renamed = now.names !== lets.names;
	lets = now;
	publish(followed.build(source), changed);
	if (renamed || [...changed].some((name) => awaited.has(name))) redrawEveryTypstChipSoon();
}

export function rereadTypstProject(): void {
	if (followed?.project && followed.build) void readProject(followed);
}
