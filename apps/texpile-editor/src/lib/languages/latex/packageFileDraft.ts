// a first draft of a package file, from what the reader's TeX reports for an installed package
import type { Argument, CommandEntry, EnvironmentEntry, PackageFile } from './knowledge/types';
import { ENVIRONMENT_NAME, MACRO_NAME } from './knowledge/userFiles';

/** spec: m/o tokens for a plain macro, or "X <xparse spec>" for a \NewDocumentCommand; own: the package's own command, not
 * one of a package it loads; redefined: it existed before the package loaded */
export type ProbedCommand = { name: string; spec: string; own?: boolean; redefined?: boolean };
export type PackageProbe = { commands: ProbedCommand[] };

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
	// expl3's own functions (\foo_bar:n) are no document commands
	const macros = commands
		.filter((c) => MACRO_NAME.test(c.name))
		.filter((c) => !environments.has(c.name) && !(c.name.startsWith('end') && environments.has(c.name.slice(3))))
		.map((c) => entryOf(c.name, c.spec));
	const envs = commands.filter((c) => environments.has(c.name) && ENVIRONMENT_NAME.test(c.name)).map((c) => entryOf(c.name, c.spec));
	return { version: 1, macros, envs };
}
