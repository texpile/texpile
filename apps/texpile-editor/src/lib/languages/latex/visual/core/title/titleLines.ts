// the commands that set the title block, drawn as the block prints them: the title large and centered, the authors with
// their marks, affiliations and addresses smaller under them, then the date, keywords and classification codes
import { tip } from '$lib/components/tooltip.svelte';
import { faceElement, tippedFace, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { TitlePart } from '$lib/languages/latex/knowledge/types';
import type { TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import type { Stretch } from '$lib/languages/latex/parser/tree/walk/stretch';
import { m } from '$lib/paraglide/messages';
import { placeholderCommand } from '$lib/editor/visual/extensions/raw-latex/placeholderView';
import { BLOCK_NOTE, PRINT_BLOCK } from '$lib/languages/latex/titleParts';
import { noteArgument, titleReading, type TitleReading } from './titleReading';
import { titleLine } from '$lib/editor/visual/extensions/drawnChips/titleBlock/titleLine';
import './titleMatter.css';

/** `next` counts the notes of the chip, which the title block numbers with symbols */
export type TitleMarks = { next(): number };
export type TitleScope = { part: TitlePart; marks: TitleMarks };

/** draws the text of an argument, the commands in it drawn as they print in the title block */
export type TitleDrawer = (body: Stretch, scope: TitleScope) => ChipFace[] | null;

const NOTE_SYMBOLS = ['∗', '†', '‡', '§', '¶', '‖', '∗∗', '††', '‡‡'];
const HINT_LENGTH = 400;
const SEPARATOR = 'titleAnd';

function hintOf(text: string): string {
	const hint = text.replace(/\s+/g, ' ').trim();
	return hint.length > HINT_LENGTH ? hint.slice(0, HINT_LENGTH) + '…' : hint;
}

function destroyAll(parts: readonly ChipFace[] | null): void {
	parts?.forEach((part) => part.destroy?.());
}

function isSeparator(part: ChipFace): boolean {
	return part.dom.dataset[SEPARATOR] !== undefined;
}

function isSpace(part: ChipFace): boolean {
	return part.dom.childElementCount === 0 && part.dom.className === '' && part.dom.textContent?.trim() === '';
}

/** the parts between the separators, without the spaces at their ends */
function cellsOf(parts: ChipFace[]): ChipFace[][] {
	const cells: ChipFace[][] = [[]];
	for (const part of parts) {
		if (isSeparator(part)) cells.push([]);
		else cells[cells.length - 1].push(part);
	}
	return cells
		.map((cell) => {
			let from = 0;
			let to = cell.length;
			while (from < to && isSpace(cell[from])) from++;
			while (to > from && isSpace(cell[to - 1])) to--;
			return cell.slice(from, to);
		})
		.filter((cell) => cell.length > 0);
}

function labelFor(reading: TitleReading): string | null {
	if (reading.part === 'keywords') return m.title_keywords();
	if (reading.part === 'classification') {
		const named = reading.named?.trim();
		return named ? named.charAt(0).toUpperCase() + named.slice(1) : m.title_classification();
	}
	return reading.part === 'running' ? (reading.named ?? m.title_running()) : null;
}

function superscript(parts: ChipFace[]): HTMLElement {
	const sup = faceElement('sup', 'title-matter-mark');
	parts.forEach((part) => sup.append(part.dom));
	return sup;
}

type ItemParts = { part: TitlePart; label: string | null; content: ChipFace[]; mark: ChipFace[]; command: string };

/** the block's line for one command, from what its text and mark drew */
function itemOfParts({ part, label, content, mark, command }: ItemParts): ChipFace {
	const dom = titleLine(part, label);
	if (content.length === 0) {
		dom.classList.add('title-matter-empty');
		dom.append(command);
	} else if (part === 'author' || part === 'affiliation' || part === 'note') {
		const cells = cellsOf(content);
		cells.forEach((cell, i) => {
			const box = faceElement('div', 'title-matter-cell');
			if (part !== 'author' && i === 0 && mark.length) box.append(superscript(mark));
			cell.forEach((p) => box.append(p.dom));
			if (part === 'author' && i === cells.length - 1 && mark.length) box.append(superscript(mark));
			dom.append(box);
		});
	} else {
		const text = faceElement('span', 'title-matter-text');
		const glue = part === 'keywords' || part === 'classification' ? ', ' : ' ';
		cellsOf(content).forEach((cell, i) => {
			if (i > 0) text.append(glue);
			cell.forEach((p) => text.append(p.dom));
		});
		dom.append(text);
	}
	const tipped = tip(dom, hintOf(command));
	return {
		dom,
		line: true,
		decorate: (decorations) => [...content, ...mark].forEach((p) => p.decorate?.(decorations)),
		destroy() {
			destroyAll(content);
			destroyAll(mark);
			tipped.destroy();
		}
	};
}

/** a space or a comment on a line of its own changes nothing in the block */
function withoutLines(drawn: ChipFace[]): ChipFace[] {
	drawn.filter((part) => part.line).forEach((part) => part.destroy?.());
	return drawn.filter((part) => !part.line);
}

/** `\author`, `\affiliation`, `\keywords` and the rest of what sets the block, drawn; null when the text cannot be drawn */
function itemFace(call: TreeCall, reading: TitleReading, src: string, draw: TitleDrawer, marks: TitleMarks): ChipFace | null {
	const scope: TitleScope = { part: reading.part, marks };
	const drawn = draw(reading.text.body!, scope);
	if (!drawn) return null;
	const content = withoutLines(drawn);
	const mark = reading.mark ? draw(reading.mark.body!, { ...scope, part: 'mark' }) : [];
	if (!mark) {
		destroyAll(content);
		return null;
	}
	return itemOfParts({ part: reading.part, label: labelFor(reading), content, mark, command: src.slice(call.from, call.to) });
}

/** what a paper's own macro that sets its argument apart (\lyxaddress) draws as, from the parts its argument drew */
export function addressFace(drawn: ChipFace[], command: string): ChipFace {
	return itemOfParts({ part: 'affiliation', label: null, content: withoutLines(drawn), mark: [], command });
}

function noteFace(note: string, marks: TitleMarks): ChipFace {
	const at = marks.next();
	const dom = faceElement('sup', 'title-matter-mark');
	dom.textContent = NOTE_SYMBOLS[at] ?? String(at + 1);
	return tippedFace(dom, hintOf(note));
}

function printBlockFace(command: string): ChipFace | null {
	const placeholder = placeholderCommand(command);
	if (!placeholder) return null;
	const dom = faceElement('div', 'latex-placeholder');
	dom.textContent = placeholder.label;
	return tippedFace(dom, command, { line: true });
}

/** the break between the cells of a block's text: \and, and the markup of a class that stands between its parts */
export function titleSeparator(): ChipFace {
	const dom = document.createElement('span');
	dom.dataset[SEPARATOR] = '';
	return { dom };
}

function inTitle(call: TreeCall, scope: TitleScope, src: string, draw: TitleDrawer): ChipFace | ChipFace[] | null | undefined {
	if (call.name === 'and') return titleSeparator();
	if (call.name === 'today')
		return { dom: faceElement('span', '', new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) };
	const note = noteArgument(call);
	if (note) return noteFace(src.slice(note.body!.from, note.body!.to), scope.marks);
	const reading = titleReading(call);
	if (reading?.part !== 'mark') return undefined;
	const parts = draw(reading.text.body!, scope);
	return parts && { dom: superscript(parts), destroy: () => destroyAll(parts) };
}

/**
 * what a command is in the title block: undefined when it is none, null when its text cannot be drawn.
 * `scope` is set inside the text of one of the block's commands
 */
export function titleMacro(
	call: TreeCall,
	scope: TitleScope | undefined,
	src: string,
	draw: TitleDrawer,
	marks: TitleMarks
): ChipFace | ChipFace[] | null | undefined {
	if (scope) return inTitle(call, scope, src, draw);
	if (call.name === PRINT_BLOCK) return printBlockFace(src.slice(call.from, call.to));
	const note = call.name === BLOCK_NOTE ? noteArgument(call) : null;
	if (note) return noteFace(src.slice(note.body!.from, note.body!.to), marks);
	const reading = titleReading(call);
	return reading ? itemFace(call, reading, src, draw, marks) : undefined;
}
