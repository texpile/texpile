// text that belongs to the chip before it: an accent's letter (\'e, \v c) or argument group (\"{\i}), the space TeX
// drops after a symbol word (\AA ngstr), and the space after a command drawn on a line of its own. Moving it into the chip changes no byte of the
// output, since the chip's text is written as is and the text after it follows directly; it lets the chip draw as é or
// Å instead of an accent beside its own letter, and the line after a drawn space or page break start without a stray
// space, or without an empty line when another such command follows
import { Mark } from 'prosemirror-model';
import { ACCENTS, SYMBOLS } from '../../texCharacters';
import { HEAD, LINE_COMMANDS, drawnCommand } from '../../drawnCommands';
import { buildNode, textNode, type PmNode } from '../builders';
import { schema } from '../../schema/latexPMSchema';
import { concatSpans, noteSpans, sliceSpans, spansOf, type LeafSpan } from '$lib/editor/visual/sourceSpans';

function chipSpans(chip: PmNode): LeafSpan[] | undefined {
	return chip.firstChild ? spansOf(chip.firstChild) : undefined;
}

const COMMAND = /^\\([a-zA-Z]+|[^a-zA-Z])$/;

function isChip(node: PmNode | undefined): node is PmNode {
	return !!node && node.type.name === 'inline_latex';
}

/** what of `text` joins the chip `chip`: the accent's letter, or the one space after a symbol word */
function joined(chip: string, text: string): string | null {
	const name = COMMAND.exec(chip)?.[1];
	if (!name) return null;
	if (name in ACCENTS) {
		// a letter accent (\v) needs the space that ends its name; a symbol accent (\') takes the letter as it comes
		const m = (/^[a-zA-Z]$/.test(name) ? /^ \p{L}/u : /^ ?\p{L}/u).exec(text);
		return m ? m[0] : null;
	}
	return name in SYMBOLS && /^[a-zA-Z]+$/.test(name) && /^ \S/.test(text) ? ' ' : null;
}

/** a drawn command the parser left apart from the group right after it (\"{\i}), which is its argument */
function takesGroup(chip: PmNode, next: PmNode | undefined): next is PmNode {
	return (
		COMMAND.test(chip.textContent) &&
		drawnCommand(chip.textContent) &&
		isChip(next) &&
		next.textContent.startsWith('{') &&
		Mark.sameSet(chip.marks, next.marks)
	);
}

/** the whitespace after a command drawn on its own line, unless it ends the paragraph */
function lineSpace(chip: string, text: string, more: boolean): string | null {
	if (!LINE_COMMANDS.has(HEAD.exec(chip)?.[3] ?? '')) return null;
	const space = /^\s+/.exec(text)?.[0];
	return space && (more || space.length < text.length) ? space : null;
}

/** whether a chip right after `before` sits against a word, whose space after the chip keeps the next word apart from it */
function againstWord(before: PmNode | undefined): boolean {
	if (!before || before.type.name === 'hard_break') return false;
	return !/\s$/.test(before.isText ? (before.text ?? '') : before.textContent);
}

function withArgumentGroups(nodes: PmNode[]): PmNode[] {
	const out: PmNode[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const chip = nodes[i];
		const group = nodes[i + 1];
		if (isChip(chip) && takesGroup(chip, group)) {
			const spans = concatSpans([
				{ len: chip.textContent.length, spans: chipSpans(chip) },
				{ len: group.textContent.length, spans: chipSpans(group) }
			]);
			out.push(buildNode('inline_latex', chip.attrs, [textNode(chip.textContent + group.textContent, null, spans)]).mark(chip.marks));
			i++;
		} else out.push(chip);
	}
	return out;
}

export function bindTextToChips(input: PmNode[]): PmNode[] {
	// an empty \mbox right before a line break is what the serializer writes for a break opening its
	// line: the editor holds the break alone
	const nodes = withArgumentGroups(input).filter(
		(n, i, all) => !(isChip(n) && n.textContent === '\\mbox{}' && all[i + 1]?.type.name === 'hard_break')
	);
	const out: PmNode[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const chip = nodes[i];
		const next = nodes[i + 1];
		const text = next?.text ?? '';
		const bindable = isChip(chip) && next?.isText && Mark.sameSet(chip.marks, next.marks);
		const line = bindable && !againstWord(out[out.length - 1]) ? lineSpace(chip.textContent, text, i + 2 < nodes.length) : null;
		const taken = !bindable ? null : (line ?? joined(chip.textContent, text));
		if (!taken) {
			out.push(chip);
			continue;
		}
		const textSpans = spansOf(next);
		const spans = concatSpans([
			{ len: chip.textContent.length, spans: chipSpans(chip) },
			{ len: taken.length, spans: sliceSpans(text, textSpans, 0, taken.length) }
		]);
		out.push(buildNode('inline_latex', chip.attrs, [textNode(chip.textContent + taken, null, spans)]).mark(chip.marks));
		const rest = text.slice(taken.length);
		if (rest) out.push(noteSpans(schema.text(rest, next.marks), sliceSpans(text, textSpans, taken.length, text.length)));
		i++;
	}
	return out;
}
