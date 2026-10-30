import { bracedIf, indentAt, lineStart, texText } from '../sourceText';
import { branches, readForest, type Branch } from './forestTree';

const END = '\\end{forest}';

/** the tree around a position in the source */
export function forestAround(source: string, pos: number) {
	const from = source.lastIndexOf('\\begin{forest}', pos);
	const end = source.indexOf(END, pos);
	return from < 0 || end < 0 ? null : readForest(source, from, end + END.length);
}

export function branchAt(source: string, from: number) {
	const tree = forestAround(source, from);
	return tree ? (branches(tree).find((b) => b.from === from) ?? null) : null;
}

/** the branch starts its own line */
function ownLine(source: string, b: Branch) {
	return source.slice(lineStart(source, b.from), b.from).trim() === '';
}

/** where a new branch goes after `after` (or first in `parent`), on its own line when its siblings are on theirs */
function insertion(source: string, parent: Branch, after: Branch | null, text: string) {
	const sibling = after ?? parent.children[0];
	if (sibling && ownLine(source, sibling)) {
		const at = after ? after.to : sibling.from - indentAt(source, sibling.from).length - 1;
		return { at, text: `\n${indentAt(source, sibling.from)}${text}` };
	}
	if (after) return { at: after.to, text: ` ${text}` };
	// a leaf's first child goes on its line, before its `]`
	return { at: parent.to - 1, text: ` ${text}` };
}

/** forest reads a comma, a bracket or an `=` in a branch as its own */
export function branchText(text: string) {
	return bracedIf(texText(text), /[,[\]=]/);
}

/** a new branch with `text`: the last child of `st`'s branch, or the sibling right after it */
export function addBranch(source: string, from: number, where: 'child' | 'sibling', text: string) {
	const b = branchAt(source, from);
	if (!b || (where === 'sibling' && !b.parent)) return null;
	const place =
		where === 'child'
			? insertion(source, b, b.children.at(-1) ?? null, `[${branchText(text)}]`)
			: insertion(source, b.parent!, b, `[${branchText(text)}]`);
	const next = source.slice(0, place.at) + place.text + source.slice(place.at);
	return { source: next, at: place.at + place.text.indexOf('[') };
}

/** a branch taken out, with its line when it stands alone on one */
function cutBranch(source: string, b: Branch) {
	const start = lineStart(source, b.from);
	const eol = source.indexOf('\n', b.to);
	const alone = ownLine(source, b) && source.slice(b.to, eol < 0 ? source.length : eol).trim() === '';
	if (alone) return { from: start, to: eol < 0 ? source.length : eol + 1 };
	let from = b.from;
	while (from > 0 && (source[from - 1] === ' ' || source[from - 1] === '\t')) from--;
	return { from, to: b.to };
}

export function removeBranch(source: string, from: number) {
	const b = branchAt(source, from);
	if (!b || !b.parent) return source;
	const cut = cutBranch(source, b);
	return source.slice(0, cut.from) + source.slice(cut.to);
}

/** the branch's text, its later lines moved from its own indent to `to` */
function carried(source: string, b: Branch, to: string) {
	const from = indentAt(source, b.from);
	return source
		.slice(b.from, b.to)
		.split('\n')
		.map((line, k) => (k && line.startsWith(from) ? to + line.slice(from.length) : line))
		.join('\n');
}

/** the branch put last in another one, which is not inside it */
export function moveBranch(source: string, from: number, ontoFrom: number) {
	const b = branchAt(source, from);
	const onto = branchAt(source, ontoFrom);
	if (!b || !onto || !b.parent || (onto.from >= b.from && onto.to <= b.to) || b.parent.from === onto.from) return null;
	const cut = cutBranch(source, b);
	const removed = source.slice(0, cut.from) + source.slice(cut.to);
	const target = branchAt(removed, onto.from < cut.from ? onto.from : onto.from - (cut.to - cut.from))!;
	const last = target.children.at(-1) ?? null;
	const indent = last && ownLine(removed, last) ? indentAt(removed, last.from) : `${indentAt(removed, target.from)}  `;
	const place = insertion(removed, target, last, carried(source, b, indent));
	return { source: removed.slice(0, place.at) + place.text + removed.slice(place.at), at: place.at + place.text.indexOf('[') };
}

/** the branch swapped with its sibling before (-1) or after (1) it */
export function shiftBranch(source: string, from: number, by: -1 | 1) {
	const b = branchAt(source, from);
	const siblings = b?.parent?.children ?? [];
	const k = b ? siblings.indexOf(b) : -1;
	const other = siblings[k + by];
	if (!b || !other) return null;
	const [first, second] = by < 0 ? [other, b] : [b, other];
	const between = source.slice(first.to, second.from);
	const swapped = source.slice(second.from, second.to) + between + source.slice(first.from, first.to);
	const next = source.slice(0, first.from) + swapped + source.slice(second.to);
	return { source: next, at: by < 0 ? first.from : first.from + (second.to - second.from) + between.length };
}
