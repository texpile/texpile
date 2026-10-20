// commands of common packages the document does not load, offered below the rest with their \usepackage
import { pickedCompletion, type Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { offerPackageFor } from '$lib/languages/latex/symbols/latexSymbolPackage';
import { packageCompletions, type EnvironmentName, type MacroCompletion } from './packageCompletions';
import { compileEngine, isDegraded, KERNEL_PACKAGE, packagesLoadedBy, type LoadedFile } from './loadedPackages';
import { stackedCommands, stackedEnvironments } from '../../knowledge/stackedEntries';
import { codeOnly } from '../../texCode';
import { definedIn, primitiveDefsIn } from '../../userDefinitions';
import { CLASH_PROBED, SUGGESTED_PACKAGES } from '../../knowledge/catalog';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { userFilesVersion } from '../../knowledge/userFiles';
import { useNameOf } from '../../knowledge/fileIds';

const BELOW_LOADED = -10;

/** the option ranked below the rest, never raised in math, offering the \usepackage once taken */
export function offeringPackage<T extends Completion>(option: T, pkg: string, command: string): T {
	const insert = option.apply;
	return {
		...option,
		detail: pkg,
		boost: BELOW_LOADED,
		math: false,
		apply(view: EditorView, completion: Completion, from: number, to: number) {
			if (typeof insert === 'function') insert(view, completion, from, to);
			else {
				const text = insert ?? completion.label;
				view.dispatch({
					changes: { from, to, insert: text },
					selection: { anchor: from + text.length },
					annotations: pickedCompletion.of(completion)
				});
			}
			offerPackageFor({ command, package: pkg, fontenc: '' });
		}
	};
}

export type SuggestedEnvironment = EnvironmentName & { pkg: string };
export type PackageSuggestions = { macros: MacroCompletion[]; envs: SuggestedEnvironment[] };
/** names: what it and each package it loads define; clashes: what it fails to load after; off: the folder's engine
 * cannot load it, or it needs shell escape */
type Suggested = PackageSuggestions & { names: Map<string, Set<string>>; clashes: Set<string>; off: boolean };

// one namespace, since environment X is the command \X; unusual entries are defined all the same
function definedNames(file: LoadedFile): Set<string> {
	return new Set([...stackedCommands([file]).keys(), ...stackedEnvironments([file]).keys()].map((n) => n.replace(/\*$/, '')));
}

let built: { version: string; packages: Map<string, Promise<Suggested>> } | null = null;

// what loading the package brings, so \mathbb comes with amssymb, which loads amsfonts
function suggestionsOf(name: string): Promise<Suggested> {
	const version = `${userFilesVersion()}:${compileEngine()}`;
	if (built?.version !== version) built = { version, packages: new Map() };
	let suggestions = built.packages.get(name);
	if (!suggestions) {
		suggestions = packagesLoadedBy(name).then((loaded) => {
			const own = loaded.find((p) => p.name === name);
			if (!own) return { macros: [], envs: [], names: new Map(), clashes: new Set(), off: true };
			const brought = packageCompletions(loaded);
			const layers = own.layers;
			const engines = layers.reduce<string[] | undefined>((e, l) => l.engines ?? e, undefined);
			const engine = compileEngine();
			return {
				macros: brought.macros.map((o) => offeringPackage(o, name, o.label)),
				envs: brought.envs.map((e) => ({ ...e, pkg: name })),
				names: new Map(loaded.map((p) => [p.name, definedNames(p)])),
				clashes: new Set((layers.reduce<string[] | undefined>((c, l) => l.clashes ?? c, undefined) ?? []).map(useNameOf)),
				off: layers.some((l) => l.shellEscape) || (!!engines && engine !== null && !engines.includes(engine))
			};
		});
		built.packages.set(name, suggestions);
	}
	return suggestions;
}

let definedCache: { text: string; names: Set<string> } | null = null;

// what the document defines itself, which a package loaded before it may define first
function userDefinitions(text: string): Set<string> {
	if (definedCache?.text !== text) {
		const code = codeOnly(text);
		const names = [...definedIn(code, 'macro'), ...definedIn(code, 'environment'), ...primitiveDefsIn(code)].map((d) => d.name);
		definedCache = { text, names: new Set(names) };
	}
	const intel = projectIntelStore.current;
	return new Set([...definedCache.names, ...intel.macros.map((d) => d.name), ...intel.envs.map((d) => d.name)]);
}

// TeX fails to load it after a package or class the probe measured, or one the probe did not measure defines a name
// it brings, or the document defines one itself
function clashes(s: Suggested, loaded: Map<string, Set<string>>, kernel: Set<string>, user: Set<string>): boolean {
	if (s.off) return true;
	const brought = new Set([...s.names].filter(([p]) => !loaded.has(p)).flatMap(([, n]) => [...n].filter((x) => !kernel.has(x))));
	for (const [other, theirs] of loaded) {
		if (s.names.has(other)) continue;
		if (CLASH_PROBED.has(other)) {
			if (s.clashes.has(other)) return true;
		} else if ([...theirs].some((n) => brought.has(n))) return true;
	}
	return [...user].some((n) => brought.has(n));
}

let offeredCache: { loaded: LoadedFile[]; user: string; offered: PackageSuggestions } | null = null;

/** what the common packages the document does not load bring, leaving out those that clash with it */
export async function packageSuggestions(loaded: LoadedFile[], text: string): Promise<PackageSuggestions> {
	// with the file's packages unknown, a \usepackage offer would guess at what is loaded already
	if (isDegraded(loaded)) return { macros: [], envs: [] };
	const user = userDefinitions(text);
	const userKey = [...user].sort().join(',');
	if (offeredCache?.loaded === loaded && offeredCache.user === userKey) return offeredCache.offered;
	const kernel = loaded.find((p) => p.name === KERNEL_PACKAGE);
	const kernelNames = kernel ? definedNames(kernel) : new Set<string>();
	const others = new Map(loaded.filter((p) => p !== kernel).map((p) => [p.name, definedNames(p)]));
	const candidates = SUGGESTED_PACKAGES.filter((n) => !others.has(n));
	const all = await Promise.all(candidates.map(suggestionsOf));
	const kept = all.filter((s) => !clashes(s, others, kernelNames, user));
	const offered = { macros: kept.flatMap((s) => s.macros), envs: kept.flatMap((s) => s.envs) };
	offeredCache = { loaded, user: userKey, offered };
	return offered;
}
