// an entry's arguments as the parser's signature
import type { Argument } from '../../knowledge/types';

/** the arguments as `s o m d()`; null when one of them is a kind the parser cannot read */
export function signatureOfArgs(args: Argument[]): string | null {
	const kinds = args.map((a) => a.kind);
	return kinds.every((k) => /^(m|o|s|v|[dr](\(\)|<>|\[\]))$/.test(k)) ? kinds.join(' ') : null;
}
