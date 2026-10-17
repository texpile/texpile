// argument signatures for loaded packages, from the user's package file, the bundled data or what the reader's TeX reports
import { MACRO_SIGNATURES } from './parser/macros';
import { signaturesOf } from './parser/signatures/argSignature';
import { keptMacroNames } from './parser/signatures/signatureTable';
import { isBundled } from './knowledge/bundledFiles';
import { fileIdOf } from './knowledge/fileIds';
import { layersOf, type LoadedFile } from './knowledge/loadedFiles';
import { stackedCommands } from './knowledge/stackedEntries';
import { userLayers } from './knowledge/userFiles';
import type { Argument, CommandEntry, EnvironmentEntry, PackageFile } from './knowledge/types';
import { listOf } from './intellisense/packages/packageUses';

/** spec: m/o tokens for a plain macro, or "X <xparse spec>" for a \NewDocumentCommand; own: the package's own command, not
 * one of a package it loads; redefined: it existed before the package loaded */
export type ProbedCommand = { name: string; spec: string; own?: boolean; redefined?: boolean };
export type PackageProbe = { commands: ProbedCommand[] };
export type InstalledPackage = { name: string; options: string };
export type ProbeInstalledPackage = (name: string, options: string, classOptions: string) => Promise<PackageProbe | null>;

const PACKAGE_NAME = /^[\w.+-]+$/;
// the converter reads these commands' arguments as the parser lays them out, whatever a package says
const KNOWN = new Set([...Object.keys(MACRO_SIGNATURES), ...keptMacroNames(false)]);
// the tokenizer reads \verbatiminput as \verb with "a" as its delimiter, which swallows the definitions after it
function definable(name: string): boolean {
	return !KNOWN.has(name) && !name.startsWith('verb');
}
const cache = new Map<string, Promise<Map<string, string>>>();

function definitionLine(name: string, signature: string): string {
	const args = signature.split(/\s+/).filter(Boolean);
	if (args.every((a) => a === 'm')) return `\\newcommand{\\${name}}${args.length ? `[${args.length}]` : ''}{}`;
	return `\\NewDocumentCommand{\\${name}}{${signature}}{}`;
}

/** the arguments as s, o and m; null for kinds the parser and package files cannot carry (delimited, verbatim) */
export function argumentsOf(spec: string): string | null {
	if (!spec.startsWith('X ')) return spec;
	const s = spec.slice(2);
	const out: string[] = [];
	let i = 0;
	function skipGroup() {
		let depth = 0;
		do {
			if (s[i] === '{') depth++;
			else if (s[i] === '}') depth--;
			i++;
		} while (depth > 0 && i < s.length);
	}
	while (i < s.length) {
		const c = s[i++];
		if (c === ' ' || c === '+' || c === '!') continue;
		if (c === '>' || c === '=') skipGroup();
		else if (c === 'm' || c === 'o' || c === 's') out.push(c);
		else if (c === 'O') {
			out.push('o');
			skipGroup();
		} else return null;
	}
	return out.join(' ');
}

/** environment names: a command whose end command the package defines too */
function environmentsIn(probe: PackageProbe): Set<string> {
	const names = new Set(probe.commands.map((c) => c.name));
	return new Set([...names].filter((n) => names.has(`end${n}`)));
}

// a command TeX reports with no arguments is left to the parser's usage guess: many read theirs as they run
function probeDefinitions(probe: PackageProbe): Map<string, string> {
	const lines = new Map<string, string>();
	for (const { name, spec } of probe.commands) {
		const args = argumentsOf(spec);
		if (args && definable(name)) lines.set(name, definitionLine(name, args));
	}
	return lines;
}

function fileDefinitions(file: LoadedFile): Map<string, string> {
	const lines = new Map<string, string>();
	for (const [name, signature] of signaturesOf(stackedCommands([file]).values()))
		if (definable(name)) lines.set(name, definitionLine(name, signature));
	return lines;
}

// own commands only: algpseudocode loads algorithmicx, whose \algdef reads its arguments as it runs
async function packageDefinitions(name: string, options: string, classOptions: string): Promise<Map<string, string>> {
	const layers = await layersOf(name);
	if (!layers.length) return new Map();
	return fileDefinitions({ id: fileIdOf(name), name, layers, options: new Set([...listOf(options), ...listOf(classOptions)]) });
}

function entryOf(name: string, spec: string): CommandEntry & EnvironmentEntry {
	const args = (argumentsOf(spec) ?? '').split(' ').filter((a) => a === 's' || a === 'o' || a === 'm');
	return args.length ? { name, args: args.map((kind): Argument => ({ kind })) } : { name };
}

/** a starting package file, from what the reader's TeX reports for the package itself */
export function packageFileFrom(probe: PackageProbe): PackageFile {
	const environments = environmentsIn(probe);
	const commands = probe.commands.filter((c) => c.own && !c.redefined).sort((a, b) => a.name.localeCompare(b.name));
	const macros = commands
		.filter((c) => !environments.has(c.name) && !(c.name.startsWith('end') && environments.has(c.name.slice(3))))
		.map((c) => entryOf(c.name, c.spec));
	const envs = commands.filter((c) => environments.has(c.name)).map((c) => entryOf(c.name, c.spec));
	return { version: 1, macros, envs };
}

/** stub definitions of the packages' commands, for the parser's signature scan; the document class is class-<name> */
export async function installedPackageDefinitions(
	packages: InstalledPackage[],
	classOptions: string,
	probe: ProbeInstalledPackage
): Promise<string> {
	const named = packages.filter((p) => PACKAGE_NAME.test(p.name));
	const found = await Promise.all(
		named.map(({ name, options }) => {
			if (userLayers(name).length || isBundled(fileIdOf(name))) return packageDefinitions(name, options, classOptions);
			// a class has no reading of its own
			if (name.startsWith('class-')) return Promise.resolve(new Map<string, string>());
			const key = `${name}[${options}]{${classOptions}}`;
			let entry = cache.get(key);
			if (!entry) {
				entry = probe(name, options, classOptions).then(
					(result) => {
						// asked again next time: TeX may be installed or found by then
						if (!result) cache.delete(key);
						return result ? probeDefinitions(result) : new Map<string, string>();
					},
					() => {
						cache.delete(key);
						return new Map<string, string>();
					}
				);
				cache.set(key, entry);
			}
			return entry;
		})
	);
	// a package loads after the class, so its definition stands; two packages that disagree (\For) leave the usage guess
	const fromClass = new Map<string, string>();
	const lines = new Map<string, string | null>();
	found.forEach((defs, i) => {
		const isClass = named[i].name.startsWith('class-');
		for (const [name, line] of defs)
			if (isClass) fromClass.set(name, line);
			else lines.set(name, lines.has(name) && lines.get(name) !== line ? null : line);
	});
	for (const [name, line] of fromClass) if (!lines.has(name)) lines.set(name, line);
	return [...lines.values()].filter(Boolean).join('\n');
}
