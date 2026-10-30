import type { LetGoReference } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatPoint } from '$lib/draw/editor/figure/numbers';
import { readPlacement, writePlacement } from '../moves/placement';
import { readPicture, type Statement } from '../picture';
import { applyTextEdits, escapeRegExp, type TextEdit } from '../sourceText';
import { namesGiven, ownSpans } from './statementNeeds';

/**
 * What `gone` gives a name to, let go of before it goes, as Excalidraw's arrows let go of a shape: each point another
 * statement takes from it is written where `pointOf` says it is, in that statement's coordinates, and a node placed
 * beside it is put `at` where `placeOf` says it stands
 */
export function letGoOf(
	source: string,
	pictureIndex: number,
	gone: number[],
	pointOf: (st: Statement, ref: LetGoReference) => Point | null,
	placeOf: (st: Statement) => Point | null
) {
	const picture = readPicture(source, pictureIndex);
	if (!picture) return source;
	const owners = new Map<string, number>();
	for (const st of picture.statements) if (gone.includes(st.i)) for (const name of namesGiven(source, st)) owners.set(name, st.i);
	if (!owners.size) return source;
	const names = [...owners.keys()].map(escapeRegExp).join('|');
	const reference = new RegExp(`\\(\\s*(${names})(?:\\.([^)]*?))?\\s*\\)`, 'g');
	const edits: TextEdit[] = [];
	const kept = picture.statements.filter((st) => !gone.includes(st.i));
	for (const st of kept)
		for (const [from, to] of ownSpans(picture.statements, st))
			for (const m of source.slice(from, to).matchAll(reference)) {
				const at = pointOf(st, { stmt: owners.get(m[1])!, name: m[1], anchor: m[2]?.trim() || null });
				if (at) edits.push({ from: from + m.index, to: from + m.index + m[0].length, text: formatPoint(at) });
			}
	let text = applyTextEdits(source, edits).source;
	for (const i of kept.map((st) => st.i).reverse()) {
		const st = readPicture(text, pictureIndex)?.statements.find((s) => s.i === i);
		const at = st && owners.has(readPlacement(text, st)?.of ?? '') ? placeOf(st) : null;
		if (st && at) text = writePlacement(text, st, { at: [at[0], at[1]] }) ?? text;
	}
	return text;
}
