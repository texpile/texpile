// suggestion plugin based on prosemirror-suggest, fixed to work with inline atom nodes

import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import type { DecorationLook } from '$lib/editor/canvas';
import { triggerBefore } from './triggerBefore';

export type TexpileSuggester = {
	/** The trigger character (e.g., '@') */
	char: string;

	/** Unique name for this suggester */
	name: string;

	/** Characters allowed after the trigger */
	supportedCharacters?: RegExp;

	/** Maximum query length before suggestion is dismissed */
	maxQueryLength?: number;

	/** CSS class to apply to active suggestions */
	suggestClassName?: string;

	/** the same on the canvas */
	suggestLook?: DecorationLook;

	/** Called when suggestion becomes active or changes */
	onChange?: (params: {
		query: { full: string; partial: string };
		range: { from: number; to: number; cursor: number };
		view: EditorView;
	}) => void;

	/** Called when suggestion becomes inactive (user moved away, clicked out, etc.) */
	onExit?: (params: { view: EditorView }) => void;
};

type SuggestMatch = {
	from: number;
	to: number;
	query: string;
	suggester: TexpileSuggester;
};

type SuggestState = {
	active: SuggestMatch | null;
	decorations: DecorationSet;
};

function findSuggestion(state: EditorState, suggester: TexpileSuggester): SuggestMatch | null {
	const { selection } = state;
	const { from, to } = selection;

	if (from !== to) return null;

	const $pos = selection.$from;
	const cursorPos = $pos.pos;

	if ($pos.parent.type.name !== 'paragraph') return null;

	const supportedChars = suggester.supportedCharacters || /[a-zA-Z0-9\s_]/;
	// from the start of the parent block, so text after inline atoms is captured
	const trigger = triggerBefore($pos.parent, $pos.parentOffset, suggester.char, supportedChars);
	if (!trigger) return null;
	const triggerPos = $pos.start() + trigger.at;
	const queryText = trigger.query;

	// single-char class, no quantifier: the template below adds the `*` (a starred default here
	// produced `**`, an invalid regexp, for any suggester that omitted supportedCharacters)
	const match = queryText.match(new RegExp(`^(${supportedChars.source}*)$`));

	if (!match) return null;

	// no prefix restriction: @ works right after quotes, punctuation, etc.

	if (suggester.maxQueryLength && queryText.length > suggester.maxQueryLength) {
		return null;
	}

	return {
		from: triggerPos,
		to: cursorPos,
		query: queryText,
		suggester
	};
}

function createDecorations(state: EditorState, match: SuggestMatch | null): DecorationSet {
	if (!match || !match.suggester.suggestClassName) {
		return DecorationSet.empty;
	}

	const decoration = Decoration.inline(
		match.from,
		match.to,
		{
			class: match.suggester.suggestClassName
		},
		match.suggester.suggestLook ? { canvasLook: match.suggester.suggestLook } : undefined
	);

	return DecorationSet.create(state.doc, [decoration]);
}

export function createTexpileSuggest(suggester: TexpileSuggester) {
	const pluginKey = new PluginKey<SuggestState>(`texpile-suggest-${suggester.name}`);

	return new Plugin<SuggestState>({
		key: pluginKey,

		state: {
			init(_, state): SuggestState {
				const match = findSuggestion(state, suggester);
				return {
					active: match,
					decorations: createDecorations(state, match)
				};
			},

			apply(tr, pluginState, oldState, newState): SuggestState {
				if (tr.getMeta('ignore-suggest')) {
					return pluginState;
				}

				const newMatch = findSuggestion(newState, suggester);

				const matchChanged =
					(!pluginState.active && newMatch) ||
					(pluginState.active && !newMatch) ||
					(pluginState.active && newMatch && (pluginState.active.from !== newMatch.from || pluginState.active.query !== newMatch.query));

				if (matchChanged) {
					return {
						active: newMatch,
						decorations: createDecorations(newState, newMatch)
					};
				}

				if (tr.docChanged && pluginState.active) {
					return {
						active: pluginState.active,
						decorations: pluginState.decorations.map(tr.mapping, tr.doc)
					};
				}

				return pluginState;
			}
		},

		props: {
			decorations(state) {
				return pluginKey.getState(state)?.decorations;
			}
		},

		view(_editorView) {
			return {
				update(view, prevState) {
					const prevPluginState = pluginKey.getState(prevState);
					const currentPluginState = pluginKey.getState(view.state);

					const prevActive = prevPluginState?.active;
					const currentActive = currentPluginState?.active;

					if (suggester.onChange && currentActive) {
						if (!prevActive || prevActive.from !== currentActive.from || prevActive.query !== currentActive.query) {
							suggester.onChange({
								query: {
									full: currentActive.query,
									partial: currentActive.query
								},
								range: {
									from: currentActive.from,
									to: currentActive.to,
									cursor: view.state.selection.from
								},
								view
							});
						}
					}

					if (suggester.onExit && prevActive && !currentActive) {
						suggester.onExit({ view });
					}
				},
				// the editor being torn down (tab/file/mode switch) is an exit too: the dropdown
				// lives on document.body, so without this it outlives the editor that opened it
				destroy() {
					suggester.onExit?.({ view: _editorView });
				}
			};
		}
	});
}
