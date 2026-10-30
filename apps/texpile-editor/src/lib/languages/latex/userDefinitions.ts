// what a document defines itself: the definers of the package data, and \def, which is TeX's own syntax
import { definitionsIn, derivedDefinitionsIn, type Definition } from './knowledge/calls/definitions';
import { commonEnvFacts, hasLiteralBody, hasUnreadBody } from './knowledge/environments/envFacts';
import type { Argument, EnvironmentBody } from './knowledge/types';
import type { OwnLiterals } from './syntax/tokens/ownSyntax';
import type { CommandReadings } from './knowledge/calls/commandCalls';
import { ownCommandReadings, type OwnDefinition } from './knowledge/calls/ownCommands';
import { latexTreeOf } from './syntax/latexTrees';

/** the definitions of `kind` in comment-masked `code`; a command only when its name is written with a backslash */
export function definedIn(code: string, kind: 'macro' | 'environment'): Definition[] {
	return definitionsIn(code).filter((d) => d.kind === kind && (kind === 'environment' || code[d.nameAt - 1] === '\\'));
}

/** how TeX reads each defined environment's body; a renewed one keeps what it wraps (\renewenvironment{equation} is still math) */
export function definedEnvironmentBodies(
	code: string,
	definitions: Definition[] = [...definitionsIn(code), ...derivedDefinitionsIn(code)]
): Map<string, EnvironmentBody | null> {
	const bodies = new Map<string, EnvironmentBody | null>();
	for (const d of definitions)
		if (d.kind === 'environment' && (d.bodyReading || d.defines !== 'renew')) bodies.set(d.name, d.bodyReading ?? null);
	return bodies;
}

/** what comment-masked `code` defines that changes which text TeX takes as written */
export function ownLiteralsIn(code: string): OwnLiterals {
	const literals: OwnLiterals = { unread: [], read: [], verbatimCommands: [] };
	const definitions = [...definitionsIn(code), ...derivedDefinitionsIn(code)];
	for (const [name, body] of definedEnvironmentBodies(code, definitions)) {
		if (body && hasUnreadBody({ body })) literals.unread.push(name);
		else if (hasLiteralBody(commonEnvFacts(name))) literals.read.push(name);
	}
	for (const d of definitions)
		if (d.kind === 'macro' && d.args.some((a) => a.kind === 'v')) literals.verbatimCommands.push({ name: d.name, args: d.args });
	return literals;
}

/** the arguments as the space separated kinds completion reads (`o m`) */
export function signatureOf(args: Argument[]): string {
	return args.map((a) => a.kind).join(' ');
}

/** `params` and `body` null when the parameter text is more than #1#2; `delimiter` ends the last argument (\def\bea#1\eea{...}) */
export type PrimitiveDefinition = { name: string; at: number; params: number | null; body: string | null; delimiter?: string };

const PRIMITIVE_DEFINERS = new Set(['def', 'gdef', 'edef', 'xdef']);
const PLAIN_PARAMS = /^\s*((?:#\d)*)\s*$/;
const DELIMITED_PARAMS = /^\s*(?:#\d\s*)+\\([A-Za-z@]+)\s*$/;

export function primitiveDefsIn(code: string): PrimitiveDefinition[] {
	const out: PrimitiveDefinition[] = [];
	latexTreeOf(code).iterate({
		enter(n) {
			if (n.name !== 'ControlWord' || !PRIMITIVE_DEFINERS.has(code.slice(n.from + 1, n.to))) return;
			let named = n.node.nextSibling;
			while (named?.name === 'Text' && !code.slice(named.from, named.to).trim()) named = named.nextSibling;
			if (named?.name !== 'ControlWord') return;
			let group = named.nextSibling;
			while (group && group.name !== 'Group' && group.name !== 'ParBreak') group = group.nextSibling;
			if (group?.name !== 'Group') return;
			const params = code.slice(named.to, group.from);
			const plain = PLAIN_PARAMS.exec(params);
			const closed = group.lastChild?.name === '}';
			out.push({
				name: code.slice(named.from + 1, named.to),
				at: n.from,
				params: plain ? plain[1].length / 2 : null,
				body: plain && closed ? code.slice(group.from + 1, group.to - 1) : null,
				...(DELIMITED_PARAMS.test(params) ? { delimiter: DELIMITED_PARAMS.exec(params)![1] } : {})
			});
		}
	});
	return out;
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
		if (d.params && d.body !== null)
			own.push({ name: d.name, args: Array.from({ length: d.params }, () => ({ kind: 'm' })), body: d.body });
	}
	const readings = ownCommandReadings(own);
	readingsCache = { code, project, readings };
	return readings;
}
