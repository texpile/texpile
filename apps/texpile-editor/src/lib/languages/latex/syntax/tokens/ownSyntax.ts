import type { Argument } from '../../knowledge/types';
import type { OwnMath } from '../ownMath';

/** `unread`: environments defined with a body TeX takes as written; `read`: defined as TeX under a name usually taken as written */
export type OwnLiterals = { unread: string[]; read: string[]; verbatimCommands: { name: string; args: Argument[] }[] };

export const NO_OWN_LITERALS: OwnLiterals = { unread: [], read: [], verbatimCommands: [] };

export type OwnSyntax = { math: OwnMath; literals: OwnLiterals };

// no value imports here: the tokenizer builds its default from this while the readers it imports are still loading
export const NO_OWN_SYNTAX: OwnSyntax = {
	math: { opens: new Set(), closes: new Set(), environments: new Set(), wrappers: new Set() },
	literals: NO_OWN_LITERALS
};

function namesKey(lists: Iterable<string>[]): string {
	return lists.map((names) => [...names].sort().join(',')).join(';');
}

function literalsKey({ unread, read, verbatimCommands }: OwnLiterals): string {
	return namesKey([
		unread,
		read,
		verbatimCommands.map((c) => `${c.name}:${c.args.map((a) => `${a.kind}${a.braced ? '+' : ''}`).join(' ')}`)
	]);
}

/** the part of `own` the tokenizer reads */
export function ownSyntaxTokensKey(own: OwnSyntax): string {
	return `${namesKey([own.math.opens, own.math.closes])}#${literalsKey(own.literals)}`;
}

export function ownSyntaxKey(own: OwnSyntax): string {
	const { opens, closes, environments, wrappers } = own.math;
	return `${namesKey([opens, closes, environments, wrappers])}#${literalsKey(own.literals)}`;
}
