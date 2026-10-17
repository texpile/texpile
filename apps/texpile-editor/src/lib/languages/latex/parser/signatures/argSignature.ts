// an entry's arguments as the parser's signature
import type { Argument } from '../../knowledge/types';

/** the arguments as `s o m d()`; null when one of them is a kind the parser cannot read */
export function signatureOfArgs(args: Argument[]): string | null {
	const kinds = args.map((a) => a.kind);
	return kinds.every((k) => /^(m|o|s|v|[dr](\(\)|<>|\[\]))$/.test(k)) ? kinds.join(' ') : null;
}

/** each command's signature; a command without arguments is left to the usage guess (\newblock{In}, \iint {\frac..}) */
export function signaturesOf(entries: Iterable<{ name: string; args?: Argument[] | null }>): Map<string, string> {
	const signatures = new Map<string, string>();
	for (const e of entries) {
		const signature = e.args?.length ? signatureOfArgs(e.args) : null;
		if (signature && /^[a-zA-Z]+$/.test(e.name) && !signatures.has(e.name)) signatures.set(e.name, signature);
	}
	return signatures;
}
