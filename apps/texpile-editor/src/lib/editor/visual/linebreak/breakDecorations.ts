// the decorations that hold a paragraph to the breaks chosen for it
import type { Node as PMNode } from 'prosemirror-model';
import { Decoration } from 'prosemirror-view';
import type { ChosenBreaks } from './paragraphBreaks';

// ProseMirror reuses any drawn piece up to five ahead that reads the same under an equal decoration and drops what lies
// between, so a line end space before a formula took the one after it and the formula was rebuilt. No two specs are equal
let marksMade = 0;

// the paragraph cannot wrap on its own; only the marked spaces, dashes and hyphenation points let it (app.css)
export function decorationsFor(pos: number, paragraph: PMNode, breaks: ChosenBreaks): Decoration[] {
	const held = Decoration.node(
		pos,
		pos + paragraph.nodeSize,
		{ class: breaks.justified ? 'pm-line-par pm-line-justified' : 'pm-line-par' },
		{ holdsParagraph: true, justified: breaks.justified }
	);
	const ends = breaks.marks
		.filter((mark) => !mark.inside)
		.map((mark) =>
			Decoration.inline(pos + mark.from, pos + mark.to, { class: `pm-line-${mark.kind}` }, { made: ++marksMade, kind: mark.kind })
		);
	return [held, ...ends];
}

function markKey(mark: Decoration): string {
	return `${mark.from} ${mark.to} ${mark.spec.kind ?? mark.spec.justified}`;
}

// a mark carried through the edit stays where the new breaks want one like it: most keys move no line end at all, and
// ProseMirror redraws every mark swapped for an equal one
export function marksToSwap(mine: Decoration[], wanted: Decoration[]): { stale: Decoration[]; fresh: Decoration[] } {
	const drawn = new Map<string, Decoration>();
	const stale: Decoration[] = [];
	for (const old of mine) {
		if (drawn.has(markKey(old))) stale.push(old);
		else drawn.set(markKey(old), old);
	}
	const fresh = wanted.filter((mark) => !drawn.delete(markKey(mark)));
	return { stale: [...stale, ...drawn.values()], fresh };
}

// a paragraph the browser wraps sits among held ones, and ragged beside justified text it reads as a mistake
export function plainlyJustified(pos: number, paragraph: PMNode): Decoration {
	return Decoration.node(pos, pos + paragraph.nodeSize, { class: 'pm-line-justified' }, { holdsParagraph: true });
}
