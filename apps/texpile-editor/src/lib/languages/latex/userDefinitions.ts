// what a document defines itself: the definers of the package data, and \def, which is TeX's own syntax
import { definitionsIn, type Definition } from './knowledge/calls/definitions';
import type { Argument } from './knowledge/types';
import type { CommandReadings } from './knowledge/calls/commandCalls';
import { ownCommandReadings, type OwnDefinition } from './knowledge/calls/ownCommands';

/** the definitions of `kind` in comment-masked `code`; a command only when its name is written with a backslash */
export function definedIn(code: string, kind: 'macro' | 'environment'): Definition[] {
	return definitionsIn(code).filter((d) => d.kind === kind && (kind === 'environment' || code[d.nameAt - 1] === '\\'));
}

/** the arguments as the space separated kinds completion reads (`o m`) */
export function signatureOf(args: Argument[]): string {
	return args.map((a) => a.kind).join(' ');
}

/** `params` and `bodyAt` are null when the parameter text is more than #1#2 */
export type PrimitiveDefinition = { name: string; at: number; params: number | null; bodyAt: number | null };

const PRIMITIVE_DEF = /\\[gex]?def\s*\\([A-Za-z@]+)\s*((?:#\d)*)\s*(\{)?/g;

/** \def, \gdef, \edef and \xdef in comment-masked `code` */
export function primitiveDefsIn(code: string): PrimitiveDefinition[] {
	return [...code.matchAll(PRIMITIVE_DEF)].map((m) => {
		const plain = m[3] !== undefined;
		return {
			name: m[1],
			at: m.index ?? 0,
			params: plain ? m[2].length / 2 : null,
			bodyAt: plain ? (m.index ?? 0) + m[0].length - 1 : null
		};
	});
}

/** the text inside the group that opens at `open` */
export function groupAt(code: string, open: number): string | null {
	let depth = 0;
	for (let i = open; i < code.length; i++) {
		if (code[i] === '\\') i++;
		else if (code[i] === '{') depth++;
		else if (code[i] === '}' && --depth === 0) return code.slice(open + 1, i);
	}
	return null;
}

/** a definition from another project file, as projectIntel keeps it */
export type ProjectDefinition = { name: string; signature: string; definition?: string };

let readingsCache: { code: string; project: readonly ProjectDefinition[]; readings: CommandReadings } | null = null;

/** the wrapper commands comment-masked `code` and the project's other files define, read as the commands they wrap */
export function ownReadingsIn(code: string, project: readonly ProjectDefinition[] = []): CommandReadings {
	if (readingsCache?.code === code && readingsCache.project === project) return readingsCache.readings;
	const own: OwnDefinition[] = project.flatMap((d) =>
		d.definition === undefined
			? []
			: [
					{
						name: d.name,
						args: d.signature
							.split(' ')
							.filter(Boolean)
							.map((kind) => ({ kind })),
						body: d.definition
					}
				]
	);
	for (const d of definedIn(code, 'macro')) if (d.body !== undefined) own.push({ name: d.name, args: d.args, body: d.body });
	for (const d of primitiveDefsIn(code)) {
		const body = d.bodyAt === null || !d.params ? null : groupAt(code, d.bodyAt);
		if (body !== null) own.push({ name: d.name, args: Array.from({ length: d.params ?? 0 }, () => ({ kind: 'm' })), body });
	}
	const readings = ownCommandReadings(own);
	readingsCache = { code, project, readings };
	return readings;
}
