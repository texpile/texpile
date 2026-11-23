// find's matches as decorations the canvas draws: a tint that hugs the text, a formula tinted by its box
import type { EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { FindMatch } from './findMatches';

const MATCH_LOOK = { look: { backgroundColor: 'var(--find-match-bg)' } };
const CURRENT_LOOK = { look: { backgroundColor: 'var(--find-match-active-bg)' } };
const UNIT_STYLE = 'border-radius: calc(var(--radius-base) * 0.5); background-color: ';

/** the match the selection is on, -1 when it is on none */
export function currentMatch(state: EditorState, matches: readonly FindMatch[]): number {
	const { from, to } = state.selection;
	return matches.findIndex((m) => m.from === from && m.to === to);
}

export function findDecorations(matches: readonly FindMatch[], current: FindMatch | null, doc: EditorState['doc']): DecorationSet {
	const decorations = matches.map((match) => {
		const on = match === current;
		if (match.kind === 'unit')
			return Decoration.node(match.from, match.to, {
				style: `${UNIT_STYLE}var(${on ? '--find-match-active-bg' : '--find-match-bg'})`
			});
		return Decoration.inline(
			match.from,
			match.to,
			{ class: on ? 'find-match-active' : 'find-match' },
			{ canvasLook: on ? CURRENT_LOOK : MATCH_LOOK }
		);
	});
	return DecorationSet.create(doc, decorations);
}
