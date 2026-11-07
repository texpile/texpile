// what a register is set to when TeX's own syntax assigns it (\tabcolsep=4pt, \parindent 0pt, \parskip=\z@): the
// value runs to the end of the number, its unit and any stretch, or to the register it is set from
import type { MadeSignature } from '../../../knowledge/types';

// a blank line ends the paragraph, and the value with it
const SPACE = String.raw`[ \t]*(?:\r?\n[ \t]*)?`;
const NUMBER = String.raw`[+-]*${SPACE}(?:\d+(?:[.,]\d*)?|[.,]\d+)`;
const UNIT = String.raw`(?:true${SPACE})?(?:pt|em|ex|cm|mm|in|bp|pc|sp|dd|cc|nd|nc|mu|px|fil+)(?![a-zA-Z])`;
const COMMAND = String.raw`\\(?:[a-zA-Z@]+|.)`;
const STRETCH = String.raw`(?:${SPACE}(?<=\s)(?:plus|minus)${SPACE}${NUMBER}${SPACE}(?:${UNIT}|${COMMAND}))*`;
const QUANTITY = new RegExp(String.raw`^(?:${NUMBER}${SPACE}(?:${UNIT}|${COMMAND})?${STRETCH}|${COMMAND})`);
// a count takes a whole number and no unit
const COUNT = new RegExp(String.raw`^(?:${NUMBER}|${COMMAND})`);
const SET = new RegExp(String.raw`^${SPACE}(=?)${SPACE}`);

/** the end of the value assigned at `from`, just past the register's name; null when none is written there */
export function registerValueEnd(src: string, from: number, register?: MadeSignature['register'] | null): number | null {
	const rest = src.slice(from, from + 120);
	const set = SET.exec(rest)!;
	const value = (register === 'count' ? COUNT : QUANTITY).exec(rest.slice(set[0].length));
	// without an = only a number sets it: a command after a register is the next thing in the text
	if (!value || (!set[1] && value[0].startsWith('\\'))) return null;
	return from + set[0].length + value[0].length;
}
