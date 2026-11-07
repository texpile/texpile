// markdown inline serialization: marks, runs and emphasis delimiters. The nodes and marks of the elements are written
// by the plugins that own them; the core writes plain text and raw chips
import type { Node, Mark } from 'prosemirror-model';
import type { MarkdownAround, MarkdownInlineOptions, MarkdownMarkWrap, MarkdownRun, MarkdownRunCore } from '../core';
import { inlineSaves, markSaves, textSaves, wholeRun } from '../core/plugin/pluginMap';
import { escMd, cellSafe, HARD_BREAK } from './inlineSyntax';
import { createShadow, markupPlaceholder } from '$lib/serializer/shadowLeaves';

// nodes whose handler output is one run: their bytes come from attrs, not from text leaves
export function isMdHandlerLeaf(node: Node): boolean {
	return node.type.name === 'raw_latex' || wholeRun(node);
}

/** the shadow run that finds every leaf of a regenerated block in its text; see shadowLeaves */
export const mdShadow = createShadow({
	placeholder: markupPlaceholder,
	charEmissions: (ch) => [escMd(ch), '\\' + ch, ch],
	isHandlerLeaf: isMdHandlerLeaf
});

function markDelims(mark: Mark, inTableCell: boolean): MarkdownMarkWrap | null {
	return markSaves.get(mark.type.name)?.(mark, inTableCell) ?? null;
}

// the marks that write something, in the order they nest
const MARK_ORDER = [...markSaves.keys()];

function orderedMarks(marks: readonly Mark[]): Mark[] {
	return marks
		.filter((m) => MARK_ORDER.includes(m.type.name))
		.sort((a, b) => MARK_ORDER.indexOf(a.type.name) - MARK_ORDER.indexOf(b.type.name));
}

function alignMarks(active: Mark[], marks: Mark[]): Mark[] {
	const kept: Mark[] = [];
	for (const m of active) {
		if (!marks.some((x) => x.eq(m))) break;
		kept.push(m);
	}
	return [...kept, ...marks.filter((m) => !kept.some((k) => k.eq(m)))];
}

type InlineRun = MarkdownRun;

/** the character of a sibling next to a node, '' at the edge of the paragraph and a line feed beside a break */
function edgeChar(parent: Node, index: number, side: -1 | 1): string {
	const sibling = index >= 0 && index < parent.childCount ? parent.child(index) : null;
	if (!sibling) return '';
	if (sibling.type.name === 'hard_break') return '\n';
	const text = sibling.isText ? (sibling.text ?? '') : '$';
	return side < 0 ? text.slice(-1) : text.charAt(0);
}

function around(parent: Node, index: number): MarkdownAround {
	return { before: edgeChar(parent, index - 1, -1), after: edgeChar(parent, index + 1, 1) };
}

function buildRuns(parent: Node, opts: MarkdownInlineOptions): InlineRun[] {
	const inTableCell = opts.inTableCell ?? false;
	const singleLine = opts.singleLine ?? false;
	const core: MarkdownRunCore = { shadowed: (node, text) => mdShadow.shadowed(node, text), marks: orderedMarks, inTableCell, singleLine };
	const runs: InlineRun[] = [];
	let atLineStart = opts.startOfLine ?? false;
	parent.forEach((node, _offset, index) => {
		if (node.isText) {
			let run: InlineRun | null = null;
			for (const save of textSaves) {
				run = save(node, core, around(parent, index));
				if (run) break;
			}
			runs.push(
				run ?? {
					content: mdShadow.shadowed(node, escMd(node.text ?? '', atLineStart, inTableCell)),
					marks: orderedMarks(node.marks),
					isText: true
				}
			);
			atLineStart = false;
			return;
		}
		const save = inlineSaves.get(node.type.name);
		if (save) {
			const run = save(node, core);
			if (!run) return;
			runs.push(run);
			atLineStart = run.startsLine ?? false;
			return;
		}
		if (node.type.name === 'inline_latex')
			runs.push({
				content: mdShadow.shadowed(node, inTableCell ? cellSafe(node.textContent) : node.textContent),
				marks: orderedMarks(node.marks),
				isText: false
			});
		else runs.push({ content: node.isLeaf ? '' : renderInline(node, { inTableCell }), marks: orderedMarks(node.marks), isText: false });
		atLineStart = false;
	});
	const kept = runs.filter((r) => r.content !== '').map((r) => (singleLine ? { ...r, content: r.content.replace(/\n/g, ' ') } : r));
	while (kept.length > 0 && kept[kept.length - 1].content === HARD_BREAK) kept.pop();
	return kept;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const PUNCT = /[\p{P}\p{S}]/u;
const PUNCT_TAIL = /(?:\\?[\p{P}\p{S}])+$/u;
const PUNCT_HEAD = /^(?:\\?[\p{P}\p{S}])+/u;

function dropUnwritableEmphasis(runs: InlineRun[], inTableCell: boolean): InlineRun[] {
	const out = runs.map((r) => ({ ...r, marks: [...r.marks] }));
	function loose(c: string) {
		return c === '' || /\s/.test(c) || PUNCT.test(c);
	}
	for (let i = 0; i < out.length; i++) {
		for (const m of out[i].marks) {
			if (!markDelims(m, inTableCell)?.expel || (i > 0 && out[i - 1].marks.some((x) => x.eq(m)))) continue;
			let j = i;
			while (j + 1 < out.length && out[j + 1].marks.some((x) => x.eq(m))) j++;
			const text = out
				.slice(i, j + 1)
				.map((r) => r.content)
				.join('');
			if (WORD_CHAR.test(text)) continue;
			const first = text.charAt(0);
			const last = text.charAt(text.length - 1);
			const before = i > 0 ? out[i - 1].content.slice(-1) : '';
			const after = j + 1 < out.length ? out[j + 1].content.charAt(0) : '';
			const opens = first !== '' && !/\s/.test(first) && (!PUNCT.test(first) || loose(before));
			const closes = last !== '' && !/\s/.test(last) && (!PUNCT.test(last) || loose(after));
			if (opens && closes) continue;
			for (let k = i; k <= j; k++) out[k].marks = out[k].marks.filter((x) => !x.eq(m));
		}
	}
	return out;
}

/** whether `**a***b*` and `*a***b**` read back as written: one emphasis closing, the other opening */
function opensAfterClose(closing: Mark[], opening: Mark[]): boolean {
	function names(ms: Mark[]): string {
		return ms.map((m) => m.type.name).join();
	}
	return (names(closing) === 'strong' && names(opening) === 'em') || (names(closing) === 'em' && names(opening) === 'strong');
}

export function renderInline(parent: Node, opts: MarkdownInlineOptions = {}): string {
	const inTableCell = opts.inTableCell ?? false;
	const runs = dropUnwritableEmphasis(buildRuns(parent, opts), inTableCell);
	let out = '';
	let active: Mark[] = [];
	let textStart = -1;

	function expels(marks: Mark[]): boolean {
		return marks.some((m) => markDelims(m, inTableCell)?.expel);
	}

	function emitCloses(closing: Mark[], next: string) {
		let stolen = '';
		while (expels(closing)) {
			const ws = out.match(/\s+$/);
			if (ws && ws[0].length < out.length) {
				out = out.slice(0, -ws[0].length);
				stolen = ws[0] + stolen;
				continue;
			}
			const tail = textStart >= 0 && WORD_CHAR.test((stolen || next).charAt(0)) ? out.slice(textStart).match(PUNCT_TAIL) : null;
			if (tail && tail[0].length < out.length - textStart) {
				out = out.slice(0, -tail[0].length);
				stolen = tail[0] + stolen;
				continue;
			}
			break;
		}
		for (const m of closing) {
			const d = markDelims(m, inTableCell);
			if (d) out += d.close;
		}
		out += stolen;
	}

	let dropped: Mark[] = [];
	for (let r = 0; r < runs.length; r++) {
		const run = runs[r];
		dropped = dropped.filter((m) => run.marks.some((x) => x.eq(m)));
		let marks = alignMarks(
			active,
			run.marks.filter((m) => !dropped.some((x) => x.eq(m)))
		);
		let keep = 0;
		while (keep < active.length && keep < marks.length && active[keep].eq(marks[keep])) keep++;
		const closing = active.slice(keep).reverse();
		let content = run.content;
		const opensEmphasis = marks.slice(keep).filter((m) => markDelims(m, inTableCell)?.expel);
		// a closing link puts its `](..)` between the word and the emphasis, which then opens on
		// its own rather than inside the word
		const afterWord = WORD_CHAR.test(out.charAt(out.length - 1)) && !closing.some((m) => m.type.name === 'link');
		// a closing delimiter run straight before an opening one, between word characters, splits into the two
		const intraword = expels(closing) && afterWord && WORD_CHAR.test(content.charAt(0)) && !opensAfterClose(closing, marks.slice(keep));
		const punctuation = run.isText && afterWord && PUNCT_HEAD.exec(content)?.[0] === content;
		if (opensEmphasis.length && ((run.isText && !content.trim()) || intraword || punctuation)) {
			const word = intraword && run.isText ? /^[\p{L}\p{N}]+/u.exec(content)![0] : '';
			if (word && word.length < content.length) {
				runs.splice(r + 1, 0, { ...run, content: content.slice(word.length) });
				content = word;
			} else if (intraword) dropped.push(...opensEmphasis);
			marks = marks.filter((m, i) => i < keep || !opensEmphasis.includes(m));
		}
		emitCloses(closing, content);
		const opening = marks.slice(keep);
		while (run.isText && expels(opening)) {
			const lead = content.match(/^\s+/);
			if (lead && lead[0].length < content.length) {
				out += lead[0];
				content = content.slice(lead[0].length);
				continue;
			}
			const head = WORD_CHAR.test(out.charAt(out.length - 1)) ? content.match(PUNCT_HEAD) : null;
			if (head && head[0].length < content.length) {
				out += head[0];
				content = content.slice(head[0].length);
				continue;
			}
			break;
		}
		for (const m of opening) {
			const d = markDelims(m, inTableCell);
			if (m.type.name === 'link' && /(^|[^\\])(\\\\)*!$/.test(out)) out = out.slice(0, -1) + '\\!';
			if (d) out += d.open;
		}
		textStart = run.isText ? out.length : -1;
		out += content;
		active = marks;
	}
	emitCloses([...active].reverse(), '');
	return out;
}
