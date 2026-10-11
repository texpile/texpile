import { Braces } from '@lucide/svelte';
import { Plugin } from 'prosemirror-state';
import { keydownHandler } from 'prosemirror-keymap';
import { Fragment, Slice } from 'prosemirror-model';
import type { EditorView as PMView } from 'prosemirror-view';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { m } from '$lib/paraglide/messages';
import type { Dialect } from '$lib/editor/visual/dialect';
import type { CompiledSnippet } from '../expand/matchSnippets';
import { snippetRegistry, type SnippetRegistry } from '../file/snippetRegistry';
import type { CallDialect } from './callWrappers';
import { latexSourceSlice, sliceToLatex } from '$lib/editor/visual/extensions/latexClipboard';
import { sliceToTypst, typstSourceSlice } from '$lib/languages/typst/visual/clipboard';

export function visualWraps(dialect: Dialect): CompiledSnippet[] {
	return dialect === 'markdown' ? [] : snippetRegistry().languages[dialect].wraps.filter((c) => c.snippet.wrap);
}

function callSource(dialect: CallDialect, compiled: CompiledSnippet, inner: string): string {
	const { wrap, args } = compiled.snippet;
	if (dialect === 'latex') return `\\${wrap}${args ? `[${args}]` : ''}{${inner}}`;
	return `#${wrap}${args ? `(${args})` : ''}[${inner}]`;
}

// a Typst call alone on a line reads as a block, so parse it mid sentence
const EDGE = '\ue0fd';

function readInline(dialect: CallDialect, source: string): Slice | null {
	const text = `${EDGE}${source}${EDGE}`;
	const read = dialect === 'latex' ? latexSourceSlice(text) : typstSourceSlice(text);
	const para = read?.content.childCount === 1 ? read.content.firstChild! : null;
	if (!para?.isTextblock || !para.textContent.startsWith(EDGE) || !para.textContent.endsWith(EDGE)) return null;
	return new Slice(Fragment.from(para.copy(para.content.cut(1, para.content.size - 1))), 1, 1);
}

export function wrapVisualSelection(view: PMView, compiled: CompiledSnippet, dialect: CallDialect): boolean {
	const { from, to, empty, $from, $to } = view.state.selection;
	if (empty || !$from.sameParent($to) || !$from.parent.isTextblock) return false;
	const selected = view.state.doc.slice(from, to);
	const source =
		dialect === 'latex' ? callSource(dialect, compiled, sliceToLatex(selected)) : callSource(dialect, compiled, sliceToTypst(selected));
	const read = readInline(dialect, source);
	if (!read) return false;
	view.dispatch(view.state.tr.replaceRange(from, to, read).scrollIntoView());
	view.focus();
	return true;
}

export function visualWrapItems(view: PMView, dialect: Dialect, hasSelection: boolean): ContextMenuItem[] {
	const wraps = visualWraps(dialect);
	if (!wraps.length) return [];
	return [
		{ separator: true },
		{
			label: m.wrap_with(),
			icon: Braces,
			disabled: !hasSelection,
			submenu: wraps.map((c) => ({ label: c.snippet.name, onclick: () => wrapVisualSelection(view, c, dialect as CallDialect) }))
		}
	];
}

/** wrap keys, in the source editor's key names */
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
							keyed.map((c) => [
								c.snippet.key!,
								(_state: unknown, _dispatch: unknown, v?: PMView) => !!v && wrapVisualSelection(v, c, dialect as CallDialect)
							])
						)
					);
				}
				return !view.state.selection.empty && handler!(view, event);
			}
		}
	});
}
