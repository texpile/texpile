// what a raw chip shows (8.3), read from its node alone: its drawing, its source, or a block drawn whole. The keys, the gap
// cursor and line paragraphs ask it for nodes never laid out
import type { Node as PMNode, Schema } from 'prosemirror-model';
import type { ChipFace } from './chipFace';

export type ChipShows = 'face' | 'island' | 'placeholder' | 'bibliography' | 'figure-card' | 'raw-figure' | 'ieee-author';

/** how a language draws its raw chips, from the chip's source alone */
export type ChipDrawing = {
	readonly language: 'latex' | 'typst';
	/** 'face' when the source may draw as a drawing: the face decides */
	shows(source: string, block: boolean): ChipShows;
	face(source: string, block: boolean): ChipFace | null;
};

/** what the keys need of a node drawn in place of its source */
export type DrawnChip = {
	/** on a line of its own, which vertical arrows stop on */
	readonly ownLine: boolean;
	/** stands in the text as one character, which the keys step over and delete */
	readonly character: boolean;
};

type ChipAnswer = { shows: ChipShows; drawn: DrawnChip | null };

const RAW_CHIPS = new Set(['raw_latex', 'inline_latex']);
const drawings = new WeakMap<Schema, ChipDrawing>();
const answers = new WeakMap<PMNode, ChipAnswer>();

/** the language's drawing for the raw chips of its schema; Markdown registers none, so its chips stay source */
export function registerChipDrawing(schema: Schema, drawing: ChipDrawing): void {
	drawings.set(schema, drawing);
}

export function chipDrawingOf(node: PMNode): ChipDrawing | null {
	return RAW_CHIPS.has(node.type.name) ? (drawings.get(node.type.schema) ?? null) : null;
}

/** a face for the chip's source, every part of it on the canvas; an inline chip with a part on a line of its own stays source,
 * a block holds both (a definition, a vertical space and the text after them) */
export function drawnFaceOf(node: PMNode): ChipFace | null {
	const face = chipDrawingOf(node)?.face(node.textContent, node.isBlock) ?? null;
	return face && (!face.mixed || node.isBlock) ? face : null;
}

function answerOf(node: PMNode): ChipAnswer {
	const known = answers.get(node);
	if (known) return known;
	const drawing = chipDrawingOf(node);
	let answer: ChipAnswer = { shows: 'island', drawn: null };
	const shows = drawing?.shows(node.textContent, node.isBlock) ?? 'island';
	if (shows !== 'face') answer = { shows, drawn: null };
	else {
		const face = drawnFaceOf(node);
		if (face) answer = { shows, drawn: { ownLine: node.isBlock || face.line === true, character: face.character === true } };
	}
	answers.set(node, answer);
	return answer;
}

export function chipShows(node: PMNode): ChipShows {
	return answerOf(node).shows;
}

/** the chip as the keys see it when it draws as a drawing, else null */
export function drawnChipOf(node: PMNode | null | undefined): DrawnChip | null {
	return node ? answerOf(node).drawn : null;
}
