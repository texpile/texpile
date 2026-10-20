// what completion shows and inserts for an entry, worked out from its arguments
import type { Argument } from './types';

/** the brackets an argument is typed in; null for one with none of its own (s, t, e) */
export function bracketsOf(kind: string): string | null {
	const k = kind.replace(/^!/, '');
	if (k === 'm' || k === 'g' || k === 'b') return '{}';
	if (k === 'v') return '||';
	if (k === 'o') return '[]';
	if (/^[dr]..$/.test(k)) return k.slice(1);
	return null;
}

/** the arguments as brackets, such as `[]{}` */
export function formatOf(args: Argument[] | undefined): string {
	return (args ?? []).map((a) => bracketsOf(a.kind) ?? '').join('');
}

/** the form completion inserts: every [] argument left out */
export function insertedArgs(args: Argument[] | undefined): Argument[] {
	return (args ?? []).filter((a) => a.kind !== 'o' && bracketsOf(a.kind));
}

/** the inserted arguments as snippet fields, `{${1}}[${2}]`, without placeholder words: the field is selected on
 * insert, so the next completion would filter by them */
export function fieldsOf(args: Argument[]): string {
	return args
		.map((a, i) => {
			const [open, close] = bracketsOf(a.kind)!;
			return `${open}\${${i + 1}}${close}`;
		})
		.join('');
}

/** the command takes a star (\section*) */
export function takesStar(args: Argument[] | undefined): boolean {
	return args?.[0]?.kind === 's';
}
