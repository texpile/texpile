import { Braces } from '@lucide/svelte';
import { Plugin } from 'prosemirror-state';
import { keydownHandler } from 'prosemirror-keymap';
import type { EditorView as PMView } from 'prosemirror-view';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';
import type { Dialect } from '$lib/editor/visual/dialect';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { snippetRegistry, type SnippetRegistry } from '../file/snippetRegistry';

/** the Typst wrap snippets: what the visual editor can show as tagged text */
export function visualWraps(dialect: Dialect): CompiledSnippet[] {
	return dialect === 'typst' ? snippetRegistry().languages.typst.wraps.filter((c) => c.snippet.wrap) : [];
}

/** the selected text inside a call to the snippet's function */
export function wrapVisualSelection(view: PMView, compiled: CompiledSnippet): boolean {
	const type = view.state.schema.marks.call;
	const { from, to, empty } = view.state.selection;
	if (!type || empty) return false;
	view.dispatch(view.state.tr.addMark(from, to, type.create({ name: compiled.snippet.wrap, args: compiled.snippet.args ?? '' })));
	view.focus();
	return true;
}

/** "Wrap With" for the visual editor's menu; none where no snippet wraps */
export function visualWrapItems(view: PMView, dialect: Dialect, hasSelection: boolean): ContextMenuItem[] {
	const wraps = visualWraps(dialect);
	if (!wraps.length) return [];
	return [
		{ separator: true },
		{
			label: m.wrap_with(),
			icon: Braces,
			disabled: !hasSelection,
			submenu: wraps.map((c) => ({ label: c.snippet.name, onclick: () => wrapVisualSelection(view, c) }))
		}
	];
}

/** a wrap snippet's key wraps the selection here too; the key names are the source editor's */
export function visualWrapKeys(dialect: Dialect): Plugin {
	let builtFor: SnippetRegistry | null = null;
	let handler: ReturnType<typeof keydownHandler> | null = null;
	return new Plugin({
		props: {
			handleKeyDown(view, event) {
				if (builtFor !== snippetRegistry()) {
					builtFor = snippetRegistry();
					const keyed = visualWraps(dialect).filter((c) => c.snippet.key);
					handler = keydownHandler(
						Object.fromEntries(
							keyed.map((c) => [c.snippet.key!, (_state: unknown, _dispatch: unknown, v?: PMView) => !!v && wrapVisualSelection(v, c)])
						)
					);
				}
				return !view.state.selection.empty && handler!(view, event);
			}
		}
	});
}
