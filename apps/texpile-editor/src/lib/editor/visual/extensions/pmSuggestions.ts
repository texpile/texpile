// suggestions drawn in the visual editor
import { Plugin, type Transaction } from 'prosemirror-state';
import { ReplaceStep } from 'prosemirror-transform';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import type { PmSuggestionRange } from './pmSuggestionsPlace';
import { editMode, mapSuggestionEdges, noteTypedSide, typingSide } from '$lib/comments/activeSuggestions.svelte';
import type { CaretSide } from '$lib/comments/oldWordsCaret';
import { breakMark, goneBlocksElement, lineEnd, oldNodeElement, oldWordsElement, suggestionTint } from './pmSuggestionWidgets';
import { rangeAttrs } from '$lib/editor/visual/highlight/paintRange';
import { isSelfRendered } from '../diff/selfRendered';
import { liftPosition } from './liftPosition';
import { caretSideWhereItLanded, oldWordsClick, oldWordsKeyDown } from './pmOldWordsCaret';
import { hasOldWords, pmSuggestionsKey, type PmSuggestionsMeta, type PmSuggestionsState } from './pmSuggestionsState';

export { pmSuggestionsKey };

export function setPmSuggestions(view: EditorView, ranges: PmSuggestionRange[]): void {
	view.dispatch(
		view.state.tr.setMeta(pmSuggestionsKey, { type: 'set', ranges } satisfies PmSuggestionsMeta).setMeta('addToHistory', false)
	);
}

export function focusPmSuggestionMeta(id: string | null): PmSuggestionsMeta {
	return { type: 'focus', id };
}

// a delete and nothing else: the steps take content out and put none back. Its caret ends at the start
// of what it took out, so the strikethrough stands to its right whatever shape the suggestion there
// ends up: typing at one makes it a replacement, whose old words would otherwise go back to the far
// side of the caret. Not when the reader has already put the caret on the other side of some
function onlyRemoved(tr: Transaction): boolean {
	return tr.docChanged && tr.selection.empty && tr.steps.every((s) => s instanceof ReplaceStep && s.slice.size === 0);
}

function oldKey(r: PmSuggestionRange): string {
	return r.old.map((run) => `${run.text}|${run.marks.map((m) => m.type.name).join(',')}`).join('\n');
}

function build(doc: PMNode, ranges: PmSuggestionRange[], focused: string | null, caret: CaretSide | null): DecorationSet {
	const size = doc.content.size;
	const schema = doc.type.schema;
	const decos: Decoration[] = [];
	for (const r of ranges) {
		if (r.from < 0 || r.to > size || r.to < r.from) continue;
		const on = r.id === focused;
		const focus = on ? ' pm-suggest-focused' : '';
		const { id } = r;
		if (r.node) {
			if (doc.nodeAt(r.from)?.nodeSize !== r.to - r.from) continue;
			const { was, old } = r;
			if (was)
				decos.push(
					Decoration.widget(r.from, () => oldNodeElement(was, id, on), {
						side: -1,
						ignoreSelection: true,
						key: `was-${id}-${on}-${was.toString()}`
					})
				);
			// the words the node replaced, struck out before it
			if (old.length)
				decos.push(
					Decoration.widget(r.from, () => oldWordsElement(schema, old, id, on), {
						side: -1,
						ignoreSelection: true,
						key: `old-${id}-${on}-node-${oldKey(r)}`
					})
				);
			decos.push(Decoration.node(r.from, r.to, { ...rangeAttrs(suggestionTint('new', on), `pm-suggest-new${focus}`), 'data-comment': id }));
			continue;
		}
		if (r.partial) {
			doc.nodesBetween(r.from, r.to, (node, pos) => {
				decos.push(
					Decoration.node(pos, pos + node.nodeSize, {
						...rangeAttrs(suggestionTint('partial', on), `pm-suggest-partial${focus}`),
						'data-comment': id
					})
				);
				return false;
			});
			continue;
		}
		if (r.gone) {
			const { head, blocks, tail, depth } = r.gone;
			// words from the blocks the change broke into are struck where they stood, and the line the
			// first one ended still ends there until the suggestion is decided, with the blocks it took
			// whole between the two. With nothing of the line on one side of the join, the blocks stand
			// before or after the line instead, at the level they came from: otherwise they would leave an
			// empty line the caret lands on
			const $join = doc.resolve(r.from);
			const textblock = $join.parent.isTextblock;
			const split =
				textblock && (head.length > 0 || $join.parentOffset > 0) && (tail.length > 0 || $join.parentOffset < $join.parent.content.size);
			const lead = head.length === 0 && tail.length > 0 && $join.parentOffset === 0;
			const out = textblock ? (lead ? $join.before() : $join.after()) : r.from;
			const at = liftPosition(doc, out, depth);
			// the caret stands before all of the words or after all of them, as beside any other old words
			const after = (caret?.at === r.from ? caret.side : typingSide(r)) === 'after';
			function side(k: number) {
				return after ? k - 5 : k;
			}
			// the line breaker reads the two by their part, as one run of offsets
			function words(runs: typeof head, k: number, part: 'head' | 'tail') {
				const start = part === 'tail' ? head.reduce((n, run) => n + run.text.length, 0) : 0;
				decos.push(
					Decoration.widget(
						r.from,
						() => {
							const element = oldWordsElement(schema, runs, id, on, start);
							element.dataset.part = part;
							return element;
						},
						{ side: side(k), ignoreSelection: true, key: `gone-${part}-${id}-${on}-${after}-${runs.map((run) => run.text).join('')}` }
					)
				);
			}
			if (head.length) words(head, 1, 'head');
			if (split)
				decos.push(
					Decoration.widget(r.from, () => breakMark('removed', id, on), {
						side: side(2),
						ignoreSelection: true,
						key: `gone-brk-${id}-${on}-${after}`
					})
				);
			const gone = blocks.map((b) => b.toString()).join('');
			if (split)
				decos.push(
					Decoration.widget(
						r.from,
						() => {
							if (!blocks.length) return lineEnd(id);
							const box = goneBlocksElement(schema, blocks, id, on);
							box.dataset.lineEnd = '';
							return box;
						},
						{ side: side(3), ignoreSelection: true, key: `gone-end-${id}-${on}-${after}-${gone}` }
					)
				);
			if (tail.length) words(tail, 4, 'tail');
			// before the old form of a node that starts there, which stood after them
			if (blocks.length && !split)
				decos.push(
					Decoration.widget(at, () => goneBlocksElement(schema, blocks, id, on), {
						side: lead ? -1 : -2,
						ignoreSelection: true,
						key: `gone-${id}-${on}-${gone}`
					})
				);
			continue;
		}
		if (r.brk) {
			const { brk, old } = r;
			decos.push(
				Decoration.widget(r.from, () => breakMark(brk, id, on), {
					side: brk === 'added' ? 1 : -2,
					ignoreSelection: true,
					key: `brk-${id}-${on}-${brk}`
				})
			);
			// after the space that joined the two, if one did
			if (brk === 'removed')
				decos.push(Decoration.widget(r.to, () => lineEnd(id), { side: -1, ignoreSelection: true, key: `brk-end-${id}` }));
			if (old.length)
				decos.push(
					Decoration.widget(r.from, () => oldWordsElement(schema, old, id, on), {
						side: 1,
						ignoreSelection: true,
						key: `old-${id}-${on}-brk-${oldKey(r)}`
					})
				);
			if (r.to > r.from)
				decos.push(
					Decoration.inline(r.from, r.to, { ...rangeAttrs(suggestionTint('new', on), `pm-suggest-new${focus}`), 'data-comment': id })
				);
			continue;
		}
		if (hasOldWords(r)) {
			const { old } = r;
			const side = caret?.at === r.from ? caret.side : typingSide(r);
			decos.push(
				Decoration.widget(r.from, () => oldWordsElement(schema, old, id, on), {
					side: side === 'after' ? -1 : 1,
					ignoreSelection: true,
					key: `old-${id}-${on}-${side}-${oldKey(r)}`
				})
			);
		}
		if (r.to > r.from) {
			decos.push(
				Decoration.inline(r.from, r.to, { ...rangeAttrs(suggestionTint('new', on), `pm-suggest-new${focus}`), 'data-comment': id })
			);
			// a formula or a chip keeps its source as content, so an inline decoration lands on text nobody draws
			doc.nodesBetween(r.from, r.to, (node, pos) => {
				if (!node.isLeaf && isSelfRendered(node)) {
					decos.push(
						Decoration.node(pos, pos + node.nodeSize, {
							...rangeAttrs(suggestionTint('new', on), `pm-suggest-new${focus}`),
							'data-comment': id
						})
					);
					return false;
				}
				return true;
			});
		}
	}
	return DecorationSet.create(doc, decos);
}

export function pmSuggestions(): Plugin<PmSuggestionsState> {
	let mounted: EditorView | null = null;
	return new Plugin<PmSuggestionsState>({
		key: pmSuggestionsKey,
		state: {
			init: () => ({ ranges: [], focused: null, caret: null, deco: DecorationSet.empty, mode: editMode.current }),
			apply(tr, value) {
				const meta = tr.getMeta(pmSuggestionsKey) as PmSuggestionsMeta | undefined;
				const mode = editMode.current;
				if (meta?.type === 'set')
					return { ...value, ranges: meta.ranges, deco: build(tr.doc, meta.ranges, value.focused, value.caret), mode };
				if (meta?.type === 'focus') return { ...value, focused: meta.id, deco: build(tr.doc, value.ranges, meta.id, value.caret), mode };
				if (meta?.type === 'caret')
					return { ...value, caret: meta.caret, deco: build(tr.doc, value.ranges, value.focused, meta.caret), mode };
				const was = value.caret;
				const typed = was && tr.docChanged && tr.mapping.map(was.at, -1) !== tr.mapping.map(was.at, 1) ? was : null;
				let caret = was;
				if (caret) {
					const at = tr.mapping.map(caret.at, caret.side === 'before' ? 1 : -1);
					caret = tr.selection.empty && tr.selection.head === at ? (at === caret.at ? caret : { ...caret, at }) : null;
				}
				if (!caret && onlyRemoved(tr)) caret = { at: tr.selection.head, side: 'before' };
				if (!tr.docChanged) {
					if (value.mode === mode && caret === was) return value;
					return { ...value, caret, deco: build(tr.doc, value.ranges, value.focused, caret), mode };
				}
				const ranges = value.ranges.flatMap((r) => {
					const side = typed && hasOldWords(r) && r.from === typed.at ? typed.side : undefined;
					if (side) noteTypedSide(r.id, side);
					return mapSuggestionEdges(r, (pos, assoc) => tr.mapping.map(pos, assoc), side);
				});
				return { ...value, ranges, caret, deco: build(tr.doc, ranges, value.focused, caret), mode };
			}
		},
		appendTransaction: (trs, _before, state) => (mounted ? caretSideWhereItLanded(mounted, trs, state) : null),
		view(view) {
			mounted = view;
			return { destroy: () => (mounted = null) };
		},
		props: {
			decorations: (state) => pmSuggestionsKey.getState(state)?.deco ?? DecorationSet.empty,
			handleKeyDown: oldWordsKeyDown,
			handleClick: oldWordsClick
		}
	});
}
