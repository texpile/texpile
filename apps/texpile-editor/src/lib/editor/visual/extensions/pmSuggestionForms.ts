// the canvas forms of a suggestion's widgets (9.4): old words struck in the line, a break as a bar, gone blocks in a block of their own
import { Fragment, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { CanvasWidget, StyleLook } from '$lib/editor/canvas';
import { setLook } from '$lib/editor/canvas';
import type { OldRun } from './pmSuggestionTypes';

const SUGGESTION_TINTS = {
	new: ['var(--diff-insert-tint)', 18, 34],
	old: ['var(--diff-delete-tint)', 16, 30],
	partial: ['var(--color-warning-500)', 10, 20]
} as const;

/** a suggestion's colour at two strengths, so a focused one stands out of its neighbours */
export function suggestionTint(kind: keyof typeof SUGGESTION_TINTS, focused: boolean): string {
	const [color, plain, strong] = SUGGESTION_TINTS[kind];
	return `color-mix(in srgb, ${color} ${focused ? strong : plain}%, transparent)`;
}

// prosemirror-view's widget API wants an element; the canvas lays the widget out from its form
export function widgetHolder(): HTMLElement {
	return document.createElement('span');
}

export const LINE_END: CanvasWidget = { kind: 'lineEnd' };

const BREAK_LOOK: StyleLook = {
	display: 'inline-block',
	width: '2px',
	height: '1.05em',
	verticalAlign: 'text-bottom',
	borderRadius: '1px',
	marginLeft: '0.12em',
	marginRight: '0.12em'
};
const BREAK_COLORS = { added: 'var(--diff-insert-tint)', removed: 'var(--diff-delete-tint)' };

function runsOf(schema: Schema, runs: readonly OldRun[]): Fragment {
	return Fragment.from(runs.filter((run) => run.node || run.text).map((run) => run.node ?? schema.text(run.text, run.marks)));
}

export function oldWordsForm(schema: Schema, runs: readonly OldRun[], id: string, focused: boolean): CanvasWidget {
	return { kind: 'struck', runs: runsOf(schema, runs), look: 'oldWords', id, tint: suggestionTint('old', focused) };
}

// gone blocks take a block's room as the diff view's removed block does, in body text whatever block the cut joined
const GONE_LOOK: StyleLook = {
	display: 'block',
	margin: '0.35em 0',
	padding: '0.15em 0.3em',
	whiteSpace: 'break-spaces',
	borderRadius: 'calc(var(--radius-base) * 0.5)',
	fontSize: 'calc(1rem * var(--text-scaling))',
	fontWeight: 'normal',
	lineHeight: 'var(--leading-relaxed, 1.625)',
	userSelect: 'none'
};
const WAS_LOOK: StyleLook = { display: 'block', margin: '0 0 0.3em', opacity: '0.75', textDecoration: 'line-through', userSelect: 'none' };

function oldBlocksForm(blocks: readonly PMNode[], className: string, look: StyleLook, id: string, focused: boolean): CanvasWidget {
	return {
		kind: 'block',
		build(ctx) {
			const holder = ctx.el('div', `pm-suggest-old ${className}${focused ? ' pm-suggest-focused' : ''}`);
			setLook(holder, { ...look, backgroundColor: suggestionTint('old', focused) });
			holder.setAttribute('data-comment', id);
			holder.appendChild(ctx.serializeFragment(Fragment.from([...blocks]), false));
			return holder;
		}
	};
}

/** a node's old form: a block in its own block, an inline one struck in the line as its source */
export function wasNodeForm(schema: Schema, was: PMNode, id: string, focused: boolean): CanvasWidget {
	const tint = suggestionTint('old', focused);
	if (was.isBlock) return oldBlocksForm([was], 'pm-suggest-was', WAS_LOOK, id, focused);
	return {
		kind: 'struck',
		runs: was.textContent ? Fragment.from(schema.text(was.textContent)) : Fragment.from(was),
		look: 'oldWords',
		id,
		tint
	};
}

export function goneBlocksForm(blocks: readonly PMNode[], id: string, focused: boolean): CanvasWidget {
	return oldBlocksForm(blocks, 'pm-suggest-gone', GONE_LOOK, id, focused);
}

/** a bar where a break is put in or taken out, the way a diff marks one */
export function breakForm(way: 'added' | 'removed', focused: boolean): CanvasWidget {
	return {
		kind: 'inline',
		build(ctx) {
			const bar = ctx.el('span', `pm-suggest-break pm-suggest-break-${way}${focused ? ' pm-suggest-focused' : ''}`);
			setLook(bar, { ...BREAK_LOOK, backgroundColor: BREAK_COLORS[way] });
			return bar;
		}
	};
}
