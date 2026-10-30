import { codeOnly } from '../../../texCode';

let last: { text: string; code: string } | null = null;

/** what TeX reads of `text` as code, shared by the checks that run on the same text */
export function readCode(text: string): string {
	if (last?.text !== text) last = { text, code: codeOnly(text) };
	return last.code;
}
