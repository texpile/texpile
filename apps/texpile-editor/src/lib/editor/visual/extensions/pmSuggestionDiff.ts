// what changed between two parses of the same stretch of a file, as prosemirror-changeset reads it
import { ChangeSet, type TokenEncoder } from 'prosemirror-changeset';
import type { Attrs, Fragment, Mark, Node as PMNode } from 'prosemirror-model';
import { StepMap } from 'prosemirror-transform';
import { isSelfRendered } from '../diff/selfRendered';

/** a range of the document before and the range of the document after it became */
export type DocChange = { fromA: number; toA: number; fromB: number; toB: number };

// the source gap says where a block came from, the label gap where its label stood, a display's
// paragraph flags whether a blank line sat around it, and a list item's key which environment it
// was parsed from: none is what the reader sees change
const UNSEEN_ATTRS = new Set(['typGap', 'labelGap', 'inParagraph', 'continuesAfter', 'envKey']);

function attrsKey(attrs: Attrs): string {
	const rest = Object.entries(attrs).filter(([name]) => !UNSEEN_ATTRS.has(name));
	return rest.length ? JSON.stringify(Object.fromEntries(rest)) : '';
}

function markKey(mark: Mark): string {
	return `|${mark.type.name}${attrsKey(mark.attrs)}`;
}

// a character with its marks, so bolding a word is a change; a node with its attributes, so a
// heading's level or a formula's source is one
const encoder: TokenEncoder<string | number> = {
	encodeCharacter: (code, marks) => (marks.length ? `${code}${marks.map(markKey).join('')}` : code),
	encodeNodeStart: (node) => `<${node.type.name}${attrsKey(node.attrs)}`,
	encodeNodeEnd: (node) => `>${node.type.name}`,
	compareTokens: (a, b) => a === b
};

let segmenter: Intl.Segmenter | undefined;

// prosemirror-changeset's simplifyChanges takes every letter up to a space as one word, and Chinese or
// Japanese has no spaces: a character replaced in a sentence struck the whole sentence. Words here are
// the segmenter's, which the comparison uses too
function wordsAround(doc: PMNode, pos: number): { from: number; to: number }[] {
	const $pos = doc.resolve(pos);
	if (!$pos.parent.isTextblock) return [];
	const start = $pos.start();
	let text = '';
	// a node that is not text is as many characters as it has positions, none of them a letter
	$pos.parent.forEach((node) => (text += node.isText ? node.text : '￼'.repeat(node.nodeSize)));
	segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
	const words: { from: number; to: number }[] = [];
	for (const s of segmenter.segment(text)) if (s.isWordLike) words.push({ from: start + s.index, to: start + s.index + s.segment.length });
	return words;
}

/** the word of `doc` holding every character from `from` to `to`, if there is one */
function wordOver(doc: PMNode, from: number, to: number): { from: number; to: number } | null {
	return wordsAround(doc, from).find((w) => w.from <= from && to <= w.to) ?? null;
}

// a break that came or went is drawn as a break, never as part of the word it fell in
function onlyBreaks(c: DocChange, before: PMNode, after: PMNode): boolean {
	return textOf(before, c.fromA, c.toA) === '' && textOf(after, c.fromB, c.toB) === '';
}

// changes with no word boundary between them are one, and one that both takes out and puts in more than
// a single character is widened to the words it touches: half a word struck beside the other half is
// hard to read. Both sides widen alike, since the text around a change is the same in both. Never past
// the stretch compared, whose edges are a suggestion's own: letters typed against it are not its words
function wholeWords(changes: readonly DocChange[], before: PMNode, doc: PMNode, compared: readonly DocChange[]): DocChange[] {
	function stretchOf(c: DocChange) {
		return compared.find((s) => s.fromB <= c.fromB && c.toB <= s.toB && s.fromA <= c.fromA && c.toA <= s.toA);
	}
	const out: DocChange[] = [];
	for (let i = 0; i < changes.length; i++) {
		const start = i;
		const stretch = stretchOf(changes[i]);
		let deleted = changes[i].toA - changes[i].fromA;
		let inserted = changes[i].toB - changes[i].fromB;
		while (i + 1 < changes.length) {
			const gapFrom = changes[i].toB;
			const gapTo = changes[i + 1].fromB;
			if (gapFrom < gapTo && (gapFrom === 0 || !wordOver(doc, gapFrom - 1, gapTo))) break;
			if (stretchOf(changes[i + 1]) !== stretch) break;
			if (onlyBreaks(changes[i], before, doc) || onlyBreaks(changes[i + 1], before, doc)) break;
			i++;
			deleted += changes[i].toA - changes[i].fromA;
			inserted += changes[i].toB - changes[i].fromB;
		}
		const first = changes[start];
		const last = changes[i];
		if (deleted === 0 || inserted === 0 || (deleted === 1 && inserted === 1)) {
			for (const c of changes.slice(start, i + 1)) out.push({ fromA: c.fromA, toA: c.toA, fromB: c.fromB, toB: c.toB });
			continue;
		}
		let fromB = Math.min(first.fromB, wordOver(doc, first.fromB, first.fromB + 1)?.from ?? first.fromB);
		let toB = Math.max(last.toB, last.toB > 0 ? (wordOver(doc, last.toB - 1, last.toB)?.to ?? last.toB) : last.toB);
		if (stretch) {
			fromB = first.fromB - Math.min(first.fromB - fromB, first.fromB - stretch.fromB, first.fromA - stretch.fromA);
			toB = last.toB + Math.min(toB - last.toB, stretch.toB - last.toB, stretch.toA - last.toA);
		}
		// nor past the change beside it: a word that runs on across a break taken out was two words before it
		const lead = changes[start - 1];
		const next = changes[i + 1];
		if (lead) fromB = first.fromB - Math.min(first.fromB - fromB, first.fromB - lead.toB, first.fromA - lead.toA);
		if (next) toB = last.toB + Math.min(toB - last.toB, next.fromB - last.toB, next.fromA - last.toA);
		const joined = { fromA: first.fromA - (first.fromB - fromB), toA: last.toA + (toB - last.toB), fromB, toB };
		const prev = out[out.length - 1];
		if (prev && prev.toA >= joined.fromA && !onlyBreaks(prev, before, doc)) {
			prev.fromA = Math.min(prev.fromA, joined.fromA);
			prev.fromB = Math.min(prev.fromB, joined.fromB);
			prev.toA = Math.max(prev.toA, joined.toA);
			prev.toB = Math.max(prev.toB, joined.toB);
		} else out.push(joined);
	}
	return out;
}

// the tokens prosemirror-changeset compares, one per position
function tokensOf(content: Fragment, from: number, to: number, out: (string | number)[] = []): (string | number)[] {
	let off = 0;
	content.forEach((child) => {
		const end = off + child.nodeSize;
		const lo = Math.max(off, from);
		const hi = Math.min(end, to);
		if (lo < hi) {
			if (child.isText) for (let i = lo; i < hi; i++) out.push(encoder.encodeCharacter(child.text!.charCodeAt(i - off), child.marks));
			else if (child.isLeaf) out.push(encoder.encodeNodeStart(child));
			else {
				if (lo === off) out.push(encoder.encodeNodeStart(child));
				tokensOf(child.content, Math.max(off + 1, lo) - off - 1, Math.min(end - 1, hi) - off - 1, out);
				if (hi === end) out.push(encoder.encodeNodeEnd(child));
			}
		}
		off = end;
	});
	return out;
}

type Token = string | number;

function atWordEdge(doc: PMNode, pos: number): boolean {
	return !wordOver(doc, pos - 1, pos + 1);
}

function isCharacter(t: Token): boolean {
	return typeof t === 'number' || /^\d/.test(t);
}

function isLetter(t: Token): boolean {
	return isCharacter(t) && /\S/.test(String.fromCharCode(typeof t === 'number' ? t : parseInt(t, 10)));
}

function touchesSelfRendered(doc: PMNode, from: number, to: number): boolean {
	for (const $pos of [doc.resolve(from), doc.resolve(to)])
		for (let d = $pos.depth; d > 0; d--) if (isSelfRendered($pos.node(d))) return true;
	let hit = false;
	doc.nodesBetween(from, to, (node) => {
		hit ||= !node.isText && isSelfRendered(node);
		return !hit;
	});
	return hit;
}

// a change this small is someone's edit, where a word left standing reads as left standing
const SMALL = 60;

// a run both sides hold, with a letter in it and cut at word edges wherever it meets the rest of the change
function keptRun(c: DocChange, a: Token[], b: Token[], before: PMNode, after: PMNode): { i: number; j: number; len: number } | null {
	function fits(i: number, j: number, len: number): boolean {
		return (
			a.slice(i, i + len).some(isLetter) &&
			(i === 0 || atWordEdge(before, c.fromA + i)) &&
			(i + len === a.length || atWordEdge(before, c.fromA + i + len)) &&
			(j === 0 || atWordEdge(after, c.fromB + j)) &&
			(j + len === b.length || atWordEdge(after, c.fromB + j + len))
		);
	}
	let best: { i: number; j: number; len: number } | null = null;
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			if (a[i] !== b[j] || (i > 0 && j > 0 && a[i - 1] === b[j - 1])) continue;
			let run = 0;
			while (i + run < a.length && j + run < b.length && a[i + run] === b[j + run]) run++;
			for (let len = run; len > (best?.len ?? 0); len--) {
				if (!fits(i, j, len)) continue;
				best = { i, j, len };
				break;
			}
		}
	}
	return best;
}

// the same letters in other formatting or other blocks: each restyled run and each break is a change of its own
function sameLetters(c: DocChange, a: Token[], b: Token[]): DocChange[] | null {
	function code(t: Token) {
		return typeof t === 'number' ? t : parseInt(t, 10);
	}
	const la = a.filter(isCharacter);
	const lb = b.filter(isCharacter);
	if (la.length !== lb.length || la.some((t, k) => code(t) !== code(lb[k]))) return null;
	const out: DocChange[] = [];
	function add(fromA: number, toA: number, fromB: number, toB: number) {
		const prev = out[out.length - 1];
		if (prev && prev.toA === c.fromA + fromA && prev.toB === c.fromB + fromB) {
			prev.toA = c.fromA + toA;
			prev.toB = c.fromB + toB;
		} else out.push({ fromA: c.fromA + fromA, toA: c.fromA + toA, fromB: c.fromB + fromB, toB: c.fromB + toB });
	}
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && isCharacter(a[i]) && isCharacter(b[j])) {
			if (a[i] !== b[j]) add(i, i + 1, j, j + 1);
			i++;
			j++;
			continue;
		}
		const i0 = i;
		const j0 = j;
		while (i < a.length && !isCharacter(a[i])) i++;
		while (j < b.length && !isCharacter(b[j])) j++;
		if (a.slice(i0, i).join() !== b.slice(j0, j).join()) add(i0, i, j0, j);
	}
	return out;
}

// a break at one end of the change is drawn as a break, apart from the letters beside it; a lone space there is the one it replaced
function breakAtEdge(c: DocChange, a: Token[], b: Token[]): DocChange[] | null {
	if (!a.some(isLetter) && !b.some(isLetter)) return null;
	function structure(t: Token[], fromEnd: boolean) {
		let n = 0;
		while (n < t.length && !isCharacter(t[fromEnd ? t.length - 1 - n : n])) n++;
		return n;
	}
	for (const fromEnd of [true, false]) {
		const inA = structure(a, fromEnd);
		const inB = structure(b, fromEnd);
		if (inA > 0 === inB > 0) continue;
		const cutA = fromEnd ? c.toA - inA : c.fromA + inA;
		const cutB = fromEnd ? c.toB - inB : c.fromB + inB;
		return [
			{ fromA: c.fromA, toA: cutA, fromB: c.fromB, toB: cutB },
			{ fromA: cutA, toA: c.toA, fromB: cutB, toB: c.toB }
		];
	}
	return null;
}

// prosemirror-changeset reads edits fewer than a couple of tokens apart as one, so a short word left
// standing between two (a paragraph split after "A", then typed at its start) came out struck and
// typed again. Words both sides of a small change hold are kept, and the change is what is around them;
// not in a node that draws itself, which changes whole, nor where both sides rework blocks
function keptApart(c: DocChange, before: PMNode, after: PMNode): DocChange[] {
	const lenA = c.toA - c.fromA;
	const lenB = c.toB - c.fromB;
	if (lenA === 0 || lenB === 0 || lenA > SMALL || lenB > SMALL) return [c];
	const a = tokensOf(before.content, c.fromA, c.toA);
	const b = tokensOf(after.content, c.fromB, c.toB);
	if (!a.every(isCharacter) && !b.every(isCharacter)) return [c];
	if (touchesSelfRendered(before, c.fromA, c.toA) || touchesSelfRendered(after, c.fromB, c.toB)) return [c];
	const regrouped = sameLetters(c, a, b);
	if (regrouped) return regrouped;
	const kept = keptRun(c, a, b, before, after);
	if (!kept) return breakAtEdge(c, a, b)?.flatMap((x) => keptApart(x, before, after)) ?? [c];
	const { i, j, len } = kept;
	const head = { fromA: c.fromA, toA: c.fromA + i, fromB: c.fromB, toB: c.fromB + j };
	const tail = { fromA: c.fromA + i + len, toA: c.toA, fromB: c.fromB + j + len, toB: c.toB };
	return [head, tail].filter((x) => x.toA > x.fromA || x.toB > x.fromB).flatMap((x) => keptApart(x, before, after));
}

function edgeScore(doc: PMNode, from: number, to: number): number {
	const $from = doc.resolve(from);
	const $to = doc.resolve(to);
	const starts = $from.parentOffset === 0 && $to.parentOffset === 0;
	const ends = $from.parentOffset === $from.parent.content.size && $to.parentOffset === $to.parent.content.size;
	function edge(pos: number) {
		return pos <= 0 || pos >= doc.content.size || atWordEdge(doc, pos);
	}
	return (starts || ends ? 4 : 0) + (edge(from) ? 1 : 0) + (edge(to) ? 1 : 0);
}

// what one side holds and the other does not can often be read at more than one place: "two¶three" less
// "three" is "two¶" taken from the start, or "wo¶t" a letter in, and the diff takes whichever it met
// first. The reader took out the item, so the place whose ends meet block edges, then word edges, wins
function slideToEdges(c: DocChange, before: PMNode, after: PMNode, lo: number, hi: number): DocChange {
	const taken = c.toB === c.fromB;
	if (taken === (c.toA === c.fromA)) return c;
	const doc = taken ? before : after;
	const from = taken ? c.fromA : c.fromB;
	const to = taken ? c.toA : c.toB;
	function token(pos: number) {
		return tokensOf(doc.content, pos, pos + 1)[0];
	}
	let best = 0;
	let bestScore = edgeScore(doc, from, to);
	for (let k = -1; from + k >= lo && token(from + k) === token(to + k); k--) {
		const score = edgeScore(doc, from + k, to + k);
		if (score > bestScore) [best, bestScore] = [k, score];
	}
	for (let k = 1; to + k <= hi && token(from + k - 1) === token(to + k - 1); k++) {
		const score = edgeScore(doc, from + k, to + k);
		if (score > bestScore) [best, bestScore] = [k, score];
	}
	return best ? { fromA: c.fromA + best, toA: c.toA + best, fromB: c.fromB + best, toB: c.toB + best } : c;
}

function tokenAt(doc: PMNode, pos: number): Token {
	return tokensOf(doc.content, pos, pos + 1)[0];
}

// the second of two cuts slid back over what stands between them, when it can be: "of a line leaves a wide" less
// "a line leaves" is one cut, and the diff can meet it as "of " and "line leaves a" with the first "a" kept
function slidTogether(prev: DocChange, c: DocChange, before: PMNode, after: PMNode): DocChange | null {
	const taken = prev.toB === prev.fromB && c.toB === c.fromB;
	const added = prev.toA === prev.fromA && c.toA === c.fromA;
	if (!taken && !added) return null;
	const doc = taken ? before : after;
	const [from, to, gap] = taken ? [c.fromA, c.toA, c.fromA - prev.toA] : [c.fromB, c.toB, c.fromB - prev.toB];
	for (let k = 1; k <= gap; k++) if (tokenAt(doc, from - k) !== tokenAt(doc, to - k)) return null;
	return taken ? { ...prev, toA: c.toA - gap } : { ...prev, toB: c.toB - gap };
}

// one edit's cuts (or insertions) that can be read as one are, so it strikes as the one run it was; the cuts of two
// edits stay apart, since each belongs to its own suggestion
function joinedAcrossKept(changes: DocChange[], before: PMNode, after: PMNode, compared: DocChange[]): DocChange[] {
	const out: DocChange[] = [];
	for (const c of changes) {
		const prev = out[out.length - 1];
		const oneEdit = prev && compared.some((s) => s.fromA <= prev.fromA && c.toA <= s.toA && s.fromB <= prev.fromB && c.toB <= s.toB);
		const joined = oneEdit ? slidTogether(prev, c, before, after) : null;
		if (joined) out[out.length - 1] = joined;
		else out.push(c);
	}
	return out;
}

// a heading or a paragraph closing as the other is the same close: a cut from a heading into the paragraph after
// it leaves the paragraph's words closing as the heading, and read as a change there the cut was compared to the
// end of the document and drawn as whole words retyped. A block that did change kind shows it at its opening. Only
// those two: words closing as a caption were taken into a figure, which is a change the comparison must see
const JOINED = new Set(['>paragraph', '>heading']);

function sameClose(a: Token, b: Token): boolean {
	return a === b || (JOINED.has(String(a)) && JOINED.has(String(b)));
}

function readSame(before: PMNode, fromA: number, toA: number, after: PMNode, fromB: number, toB: number): boolean {
	if (toA < fromA || toA - fromA !== toB - fromB) return false;
	const a = tokensOf(before.content, fromA, toA);
	const b = tokensOf(after.content, fromB, toB);
	return a.length === b.length && a.every((t, i) => sameClose(t, b[i]));
}

// the stretches, joined wherever what lies between two of them does not read the same on both sides
function apart(before: PMNode, after: PMNode, stretches: DocChange[]): DocChange[] {
	const sizeA = before.content.size;
	const sizeB = after.content.size;
	const out: DocChange[] = [];
	for (const s of stretches) {
		const prev = out[out.length - 1];
		if (!prev) out.push(readSame(before, 0, s.fromA, after, 0, s.fromB) ? { ...s } : { ...s, fromA: 0, fromB: 0 });
		else if (readSame(before, prev.toA, s.fromA, after, prev.toB, s.fromB)) out.push({ ...s });
		else {
			prev.toA = Math.max(prev.toA, s.toA);
			prev.toB = Math.max(prev.toB, s.toB);
		}
	}
	const last = out[out.length - 1];
	if (!last) return [{ fromA: 0, toA: sizeA, fromB: 0, toB: sizeB }];
	if (!readSame(before, last.toA, sizeA, after, last.toB, sizeB)) {
		last.toA = sizeA;
		last.toB = sizeB;
	}
	return out;
}

// changeset compares UTF-16 units, and most emoji share their first half
function midPair(doc: PMNode, pos: number): boolean {
	if (pos <= 0 || pos >= doc.content.size) return false;
	const s = doc.textBetween(pos - 1, pos + 1);
	return s.length === 2 && /[\uD800-\uDBFF]/.test(s[0]) && /[\uDC00-\uDFFF]/.test(s[1]);
}

/**
 * the changes from `before` to `after`, widened to whole words where a word was partly replaced. Each
 * of `stretches` is compared on its own, where what lies between them reads the same on both sides
 */
export function diffDocs(before: PMNode, after: PMNode, stretches: DocChange[] = []): DocChange[] {
	// one step per stretch, each at the place the steps before it have left it; a single map of several
	// ranges would do, but prosemirror-changeset offsets a third range by the second one's size alone.
	// A stretch empty on both sides would come back as an empty change
	const compared = apart(before, after, stretches).filter((s) => s.toA > s.fromA || s.toB > s.fromB);
	const maps = compared.map((s) => new StepMap([s.fromB, s.toA - s.fromA, s.toB - s.fromB]));
	const set = ChangeSet.create(before, undefined, encoder).addSteps(after, maps, 0);
	const changes = joinedAcrossKept(
		set.changes.flatMap((c) => keptApart({ fromA: c.fromA, toA: c.toA, fromB: c.fromB, toB: c.toB }, before, after)),
		before,
		after,
		compared
	);
	const slid = changes.map((c, i) => {
		const prev = changes[i - 1];
		const next = changes[i + 1];
		const taken = c.toB === c.fromB;
		const s = compared.find((x) => x.fromA <= c.fromA && c.toA <= x.toA && x.fromB <= c.fromB && c.toB <= x.toB);
		const lo = Math.max(prev ? (taken ? prev.toA : prev.toB) : 0, s ? (taken ? s.fromA : s.fromB) : 0);
		const hi = Math.min(
			next ? (taken ? next.fromA : next.fromB) : (taken ? before : after).content.size,
			s ? (taken ? s.toA : s.toB) : Infinity
		);
		return slideToEdges(c, before, after, lo, hi);
	});
	return wholeWords(slid, before, after, compared).map((c) => {
		const lead = midPair(before, c.fromA) || midPair(after, c.fromB) ? 1 : 0;
		const tail = midPair(before, c.toA) || midPair(after, c.toB) ? 1 : 0;
		return { fromA: c.fromA - lead, toA: c.toA + tail, fromB: c.fromB - lead, toB: c.toB + tail };
	});
}

/** the characters of a range, one placeholder per node that is not text */
export function textOf(doc: PMNode, from: number, to: number): string {
	return doc.textBetween(from, to, '', '￼');
}
