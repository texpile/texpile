// argument signatures for loaded packages, from the user's package file or what the reader's TeX reports
import { macroInfo } from '@unified-latex/unified-latex-ctan';
import { MACRO_SIGNATURES } from './parser/macros';
import { isBundledPackage, type PackageData, type PkgEntry } from './intellisense/completion/packageData';
import { signatureOfFormat, userPackage } from './intellisense/userPackages';

/** spec: m/o tokens for a plain macro, or "X <xparse spec>" for a \NewDocumentCommand; own: the package's own command, not
 * one of a package it loads; redefined: it existed before the package loaded */
export type ProbedCommand = { name: string; spec: string; own?: boolean; redefined?: boolean };
export type PackageProbe = { commands: ProbedCommand[] };
export type InstalledPackage = { name: string; options: string };
export type ProbeInstalledPackage = (name: string, options: string, classOptions: string) => Promise<PackageProbe | null>;

const PACKAGE_NAME = /^[\w.+-]+$/;
// a package's own definition never narrows one the parser already has
const KNOWN = new Set([...Object.keys(MACRO_SIGNATURES), ...Object.values(macroInfo).flatMap((pkg) => Object.keys(pkg))]);
const cache = new Map<string, Promise<string>>();

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
function probeDefinitions(probe: PackageProbe): string {
	const lines: string[] = [];
	for (const { name, spec } of probe.commands) {
		const args = argumentsOf(spec);
		if (args && !KNOWN.has(name)) lines.push(definitionLine(name, args));
	}
	return lines.join('\n');
}

function fileDefinitions(contents: PackageData): string {
	const lines = new Map<string, string>();
	for (const m of contents.macros) {
		const signature = m.arg ? signatureOfFormat(m.arg.format) : '';
		if (signature === null || !/^[a-zA-Z]+$/.test(m.name) || KNOWN.has(m.name) || lines.has(m.name)) continue;
		lines.set(m.name, definitionLine(m.name, signature));
	}
	return [...lines.values()].join('\n');
}

function entryOf(name: string, spec: string, prefix: string): PkgEntry {
	// a package file format has only [] and {}
	const args = (argumentsOf(spec) ?? '').split(' ').filter((a) => a === 'o' || a === 'm');
	if (!args.length) return { name };
	const format = args.map((a) => (a === 'o' ? '[]' : '{}')).join('');
	const snippet = prefix + args.map((a, i) => (a === 'o' ? `[\${${i + 1}}]` : `{\${${i + 1}}}`)).join('');
	return { name, arg: { format, snippet } };
}

/** a starting package file, from what the reader's TeX reports for the package itself */
export function packageFileFrom(probe: PackageProbe): PackageData {
	const environments = environmentsIn(probe);
	const commands = probe.commands.filter((c) => c.own && !c.redefined).sort((a, b) => a.name.localeCompare(b.name));
	const macros = commands
		.filter((c) => !environments.has(c.name) && !(c.name.startsWith('end') && environments.has(c.name.slice(3))))
		.map((c) => entryOf(c.name, c.spec, c.name));
	const envs = commands.filter((c) => environments.has(c.name)).map((c) => entryOf(c.name, c.spec, ''));
	return { macros, envs, keys: {} };
}

/** stub definitions of the packages' commands, for the parser's signature scan */
export async function installedPackageDefinitions(
	packages: InstalledPackage[],
	classOptions: string,
	probe: ProbeInstalledPackage
): Promise<string> {
	const found = await Promise.all(
		packages
			.filter((p) => PACKAGE_NAME.test(p.name))
			.map(({ name, options }) => {
				const own = userPackage(name);
				if (own) return fileDefinitions(own);
				if (isBundledPackage(name)) return '';
				const key = `${name}[${options}]{${classOptions}}`;
				let entry = cache.get(key);
				if (!entry) {
					entry = probe(name, options, classOptions).then(
						(result) => {
							// asked again next time: TeX may be installed or found by then
							if (!result) cache.delete(key);
							return result ? probeDefinitions(result) : '';
						},
						() => {
							cache.delete(key);
							return '';
						}
					);
					cache.set(key, entry);
				}
				return entry;
			})
	);
	return found.filter(Boolean).join('\n');
}
