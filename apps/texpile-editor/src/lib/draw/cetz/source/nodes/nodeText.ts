import { closingBracket, splitArgs, type Arg } from '../syntax';
import { holdsText, type CetzCall, type CetzStatement } from '../picture';

/** Excalidraw's four sizes, named as TikZ's are, and the size Typst sets each in; its own text is 11pt */
export const TEXT_SIZES = [
	{ value: 'small', label: 'S' },
	{ value: 'normalsize', label: 'M' },
	{ value: 'large', label: 'L' },
	{ value: 'Large', label: 'XL' }
] as const;
const POINTS: Record<string, string> = { small: '9pt', large: '14pt', Large: '17pt' };

/** the `content` call holding a node's text: the one placed on its outline, or itself */
export function textCall(st: CetzStatement): CetzCall | null {
	if (st.kind !== 'node') return null;
	return st.text ?? (holdsText(st.command) ? st : null);
}

/** the text's argument, as written: `[...]`, or `text(fill: red)[...]` that colors and sizes it */
export function bodyOf(source: string, call: CetzCall) {
	const arg = call.command === 'finite-state' ? call.args.find((a) => a.name === 'label') : call.args.filter((a) => !a.name).at(-1);
	if (!arg) return null;
	const at = arg.value.from;
	if (source[at] === '[') return { arg, styled: null, text: { from: at + 1, to: arg.value.to - 1 } };
	const m = /^text\s*\(/.exec(source.slice(at, arg.value.to));
	if (!m) return null;
	const open = at + m[0].length - 1;
	const close = closingBracket(source, open);
	const bracket = close < 0 ? -1 : source.indexOf('[', close);
	if (bracket < 0 || source.slice(close + 1, bracket).trim() || closingBracket(source, bracket) !== arg.value.to - 1) return null;
	return { arg, styled: { open, close, args: splitArgs(source, open, close) }, text: { from: bracket + 1, to: arg.value.to - 1 } };
}

/** inside the brackets of a statement's text */
export function contentTextSpan(source: string, st: CetzStatement) {
	const call = textCall(st);
	return call ? (bodyOf(source, call)?.text ?? null) : null;
}

function styledArg(source: string, args: Arg[], name: string) {
	const a = args.find((x) => x.name === name);
	return a ? source.slice(a.value.from, a.value.to) : null;
}

export function readTextStyle(source: string, st: CetzStatement) {
	const call = textCall(st);
	const body = call && bodyOf(source, call);
	if (!body) return null;
	const args = body.styled?.args ?? [];
	const size = styledArg(source, args, 'size');
	const named = Object.entries(POINTS).find(([, pt]) => pt === size)?.[0];
	return { textColor: styledArg(source, args, 'fill') ?? 'black', textSize: size === null ? 'normalsize' : (named ?? 'custom') };
}

/** the text colored or sized, its other `text` settings kept */
export function writeTextStyle(source: string, st: CetzStatement, change: { textColor?: string | null; textSize?: string }) {
	const call = textCall(st);
	const body = call && bodyOf(source, call);
	if (!body) return null;
	const kept = (body.styled?.args ?? []).filter(
		(a) => !(a.name === 'fill' && 'textColor' in change) && !(a.name === 'size' && change.textSize)
	);
	const items = kept.map((a) => source.slice(a.from, a.to));
	if (change.textColor && change.textColor !== 'black') items.push(`fill: ${change.textColor}`);
	if (change.textSize && POINTS[change.textSize]) items.push(`size: ${POINTS[change.textSize]}`);
	if (!('textColor' in change) && !change.textSize) return source;
	const text = `[${source.slice(body.text.from, body.text.to)}]`;
	const written = items.length ? `text(${items.join(', ')})${text}` : text;
	return source.slice(0, body.arg.value.from) + written + source.slice(body.arg.value.to);
}
