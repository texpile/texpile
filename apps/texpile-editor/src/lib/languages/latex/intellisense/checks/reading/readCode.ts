import { codeOnly } from '../../../texCode';
import { withoutExpl } from './definedNames';

let last: { text: string; code: string } | null = null;

/** what TeX reads of `text` as code, shared by the checks that run on the same text */
export function readCode(text: string): string {
	if (last?.text !== text) last = { text, code: withoutExpl(codeOnly(text)) };
	return last.code;
}
