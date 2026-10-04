// Pure edit computations for the markdown source toolbar/keymap — the md sibling of
// intellisense/shortcuts.ts's computeToggleWrap: pure functions of EditorState (unit-testable
// without a DOM EditorView), multi-cursor ranges handled right-to-left so earlier edits don't
// shift later offsets.
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';

type Change = { from: number; to: number; insert: string };

function sortedRanges(state: EditorState) {
	return [...state.selection.ranges].sort((a, b) => b.from - a.from);
}

function stars(s: string, atEnd: boolean): number {
	return (atEnd ? /\**$/ : /^\**/).exec(s)![0].length;
}

// `*` and `**` share a character: a run of two stars is bold, which italics wrap instead of taking away
function italicHeld(delim: string, before: number, after: number): boolean {
	return delim !== '*' || Math.min(before, after) % 2 === 1;
}

/** toggle a symmetric delimiter pair (** * ~~ ` $) around each selection; empty selections get
 * an empty pair with the cursor inside. */
export function computeToggleDelim(state: EditorState, delim: string): TransactionSpec {
	const text = state.doc.toString();
	const changes: Change[] = [];
	let newSelectionPos: number | null = null;

	for (const range of sortedRanges(state)) {
		if (range.empty) {
			// cursor already between an empty pair: toggle it away
			const before = text.slice(range.from - delim.length, range.from);
			const after = text.slice(range.from, range.from + delim.length);
			if (before === delim && after === delim) {
				changes.push({ from: range.from - delim.length, to: range.from + delim.length, insert: '' });
				newSelectionPos = range.from - delim.length;
			} else {
				changes.push({ from: range.from, to: range.from, insert: delim + delim });
				newSelectionPos = range.from + delim.length;
			}
			continue;
		}
		const selected = text.slice(range.from, range.to);
		if (
			selected.length >= delim.length * 2 &&
			selected.startsWith(delim) &&
			selected.endsWith(delim) &&
			italicHeld(delim, stars(selected, false), stars(selected, true))
		) {
			changes.push({ from: range.from, to: range.to, insert: selected.slice(delim.length, -delim.length) });
		} else if (
			text.slice(range.from - delim.length, range.from) === delim &&
			text.slice(range.to, range.to + delim.length) === delim &&
			italicHeld(delim, stars(text.slice(Math.max(0, range.from - 3), range.from), true), stars(text.slice(range.to, range.to + 3), false))
		) {
			// delimiters sit just OUTSIDE the selection
			changes.push({ from: range.from - delim.length, to: range.to + delim.length, insert: selected });
		} else {
			changes.push({ from: range.from, to: range.to, insert: delim + selected + delim });
		}
	}
	return { changes, ...(newSelectionPos != null ? { selection: EditorSelection.cursor(newSelectionPos) } : {}) };
}

/** set (or toggle off) an ATX heading level on every line the selection touches; 0 = paragraph. */
export function computeHeadingLine(state: EditorState, level: number): TransactionSpec {
	const changes: Change[] = [];
	const doneLines = new Set<number>();
	for (const range of sortedRanges(state)) {
		const fromLine = state.doc.lineAt(range.from).number;
		const toLine = state.doc.lineAt(range.to).number;
		for (let n = toLine; n >= fromLine; n--) {
			if (doneLines.has(n)) continue;
			doneLines.add(n);
			const line = state.doc.line(n);
			const m = /^(#{1,6})\s+/.exec(line.text);
			const current = m ? m[1].length : 0;
			// same level again toggles back to paragraph
			const target = current === level ? 0 : level;
			const prefix = target === 0 ? '' : '#'.repeat(target) + ' ';
			changes.push({ from: line.from, to: line.from + (m ? m[0].length : 0), insert: prefix });
		}
	}
	return { changes };
}

/** toggle '> ' quoting on every selected line: add when any line lacks it, else strip. */
export function computeQuoteLines(state: EditorState): TransactionSpec {
	const range = state.selection.main;
	const fromLine = state.doc.lineAt(range.from).number;
	const toLine = state.doc.lineAt(range.to).number;
	const lines = [];
	for (let n = fromLine; n <= toLine; n++) lines.push(state.doc.line(n));
	const allQuoted = lines.every((l) => /^>\s?/.test(l.text) || l.text === '');
	const changes: Change[] = [];
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (allQuoted) {
			const m = /^>\s?/.exec(line.text);
			if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' });
		} else {
			changes.push({ from: line.from, to: line.from, insert: '> ' });
		}
	}
	return { changes };
}

/** toggle a list marker on every selected line: '- ' bullets or '1. 2. …' numbering. Strips any
 * existing marker of the same kind when every non-empty line already carries one. */
export function computeListLines(state: EditorState, kind: 'bullet' | 'ordered'): TransactionSpec {
	const range = state.selection.main;
	const fromLine = state.doc.lineAt(range.from).number;
	const toLine = state.doc.lineAt(range.to).number;
	const lines = [];
	for (let n = fromLine; n <= toLine; n++) lines.push(state.doc.line(n));
	const re = kind === 'bullet' ? /^[-*+]\s/ : /^\d+[.)]\s/;
	const allMarked = lines.every((l) => re.test(l.text) || l.text === '');
	const changes: Change[] = [];
	let counter = 1;
	for (const line of lines) {
		if (allMarked) {
			const m = re.exec(line.text);
			if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' });
		} else if (line.text !== '') {
			changes.push({ from: line.from, to: line.from, insert: kind === 'bullet' ? '- ' : `${counter++}. ` });
		}
	}
	return { changes };
}

/** wrap the selection in a fenced code block; empty selection leaves the cursor on the info line. */
export function computeFence(state: EditorState): TransactionSpec {
	const range = state.selection.main;
	const selected = state.doc.sliceString(range.from, range.to);
	const runs = selected.match(/`{3,}/g);
	const fence = '`'.repeat(runs ? Math.max(3, ...runs.map((r) => r.length)) + 1 : 3);
	const insert = `${fence}\n${selected}${selected && !selected.endsWith('\n') ? '\n' : ''}${fence}\n`;
	return {
		changes: { from: range.from, to: range.to, insert },
		selection: EditorSelection.cursor(range.from + fence.length) // on the info-string slot
	};
}

/** [selection](url) with the url placeholder selected, or a full skeleton on an empty cursor. */
export function computeLink(state: EditorState): TransactionSpec {
	const range = state.selection.main;
	const selected = state.doc.sliceString(range.from, range.to);
	const label = selected || 'text';
	const insert = `[${label}](url)`;
	const urlStart = range.from + label.length + 3; // past "[label]("
	return {
		changes: { from: range.from, to: range.to, insert },
		selection: EditorSelection.range(urlStart, urlStart + 3)
	};
}

/** `![alt](path)` with the path placeholder selected; a selection becomes the alt text. */
export function computeImage(state: EditorState): TransactionSpec {
	const range = state.selection.main;
	const selected = state.doc.sliceString(range.from, range.to);
	const alt = selected || 'alt';
	const path = 'image.png';
	const insert = `![${alt}](${path})`;
	const pathStart = range.from + alt.length + 4; // past "![alt]("
	return {
		changes: { from: range.from, to: range.to, insert },
		selection: EditorSelection.range(pathStart, pathStart + path.length)
	};
}

/** $$ block around the selection (or an empty pair with the cursor inside). */
export function computeMathBlock(state: EditorState): TransactionSpec {
	const range = state.selection.main;
	const selected = state.doc.sliceString(range.from, range.to);
	const insert = `$$\n${selected}${selected && !selected.endsWith('\n') ? '\n' : ''}$$\n`;
	return {
		changes: { from: range.from, to: range.to, insert },
		selection: EditorSelection.cursor(range.from + 3)
	};
}

/** GFM table skeleton on its own lines after the cursor's line. */
export function computeTableSkeleton(state: EditorState): TransactionSpec {
	const line = state.doc.lineAt(state.selection.main.head);
	const lead = line.length > 0 ? '\n\n' : '';
	const insert = `${lead}| Column | Column |\n| --- | --- |\n|  |  |\n`;
	return {
		changes: { from: line.to, to: line.to, insert },
		selection: EditorSelection.cursor(line.to + lead.length + 2)
	};
}

/** thematic break on its own line. */
export function computeHr(state: EditorState): TransactionSpec {
	const line = state.doc.lineAt(state.selection.main.head);
	const lead = line.length > 0 ? '\n\n' : '';
	const insert = `${lead}---\n`;
	return { changes: { from: line.to, to: line.to, insert } };
}
