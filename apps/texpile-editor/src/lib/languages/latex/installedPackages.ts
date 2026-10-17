// package files for installed packages Texpile ships none for, from what the reader's TeX reports
import { isBundled } from './knowledge/bundledFiles';
import { fileIdOf } from './knowledge/fileIds';
import { setProbedFile, userLayers } from './knowledge/userFiles';
import type { Argument, CommandEntry, EnvironmentEntry, PackageFile } from './knowledge/types';

/** spec: m/o tokens for a plain macro, or "X <xparse spec>" for a \NewDocumentCommand; own: the package's own command, not
 * one of a package it loads; redefined: it existed before the package loaded */
export type ProbedCommand = { name: string; spec: string; own?: boolean; redefined?: boolean };
export type PackageProbe = { commands: ProbedCommand[] };
export type InstalledPackage = { name: string; options: string };
export type ProbeInstalledPackage = (name: string, options: string, classOptions: string) => Promise<PackageProbe | null>;

const PACKAGE_NAME = /^[\w.+-]+$/;
const asked = new Map<string, Promise<void>>();

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

/** asks the reader's TeX about every package Texpile and the reader have no file for; a class has no reading of its
 * own. The answers become package files the parse and completion read */
export async function probeInstalledPackages(
	packages: InstalledPackage[],
	classOptions: string,
	probe: ProbeInstalledPackage
): Promise<void> {
	const unknown = packages.filter(
		(p) => PACKAGE_NAME.test(p.name) && !p.name.startsWith('class-') && !userLayers(p.name).length && !isBundled(fileIdOf(p.name))
	);
	await Promise.all(
		unknown.map(({ name, options }) => {
			const key = `${name}[${options}]{${classOptions}}`;
			let entry = asked.get(key);
			if (!entry) {
				entry = probe(name, options, classOptions).then(
					(result) => {
						// asked again next time: TeX may be installed or found by then
						if (!result) asked.delete(key);
						else setProbedFile(name, packageFileFrom(result));
					},
					() => void asked.delete(key)
				);
				asked.set(key, entry);
			}
			return entry;
		})
	);
}
