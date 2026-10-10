import { Braces } from '@lucide/svelte';
import type { EditorView as PMView } from 'prosemirror-view';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';
import type { Dialect } from '$lib/editor/visual/dialect';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { snippetRegistry } from '../file/snippetRegistry';

/** the Typst wrap snippets: what the visual editor can show as tagged text */
export function visualWraps(dialect: Dialect): CompiledSnippet[] {
	return dialect === 'typst' ? snippetRegistry().languages.typst.wraps.filter((c) => c.snippet.wrap) : [];
}

/** the selected text inside a call to the snippet's function */
export function wrapVisualSelection(view: PMView, compiled: CompiledSnippet): void {
	const type = view.state.schema.marks.call;
	const { from, to, empty } = view.state.selection;
	if (!type || empty) return;
	view.dispatch(view.state.tr.addMark(from, to, type.create({ name: compiled.snippet.wrap, args: compiled.snippet.args ?? '' })));
	view.focus();
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
