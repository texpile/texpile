// the Insert menu's parts read from the open file's insert list, and the arguments of what the caret is in
import { editorViewStore } from '$lib/stores/editorStore';
import { activeCm, cmReplace, runVisualCommand } from '$lib/chrome/menuBarCommands';
import type { InsertItem } from '$lib/editor/visual/insert/insertItem';
import { insertArguments, insertItems, insertSourceOf } from '$lib/editor/visual/insert/insertItems.svelte';
import { insertBlockAtCaret } from '$lib/editor/visual/insert/insertRun';
import { groupedByCategory, type InsertGroup } from '$lib/editor/visual/insert/insertCategories';
import type { formatOf } from '$lib/workspace/documentBuffer.svelte';
import { cmAfterLine, insertChips, selectedLatex } from './menuBarInsertDrawn';

type ListInsertDeps = {
	dialect: () => ReturnType<typeof formatOf>;
	askText: (title: string, initial?: string, offered?: string[]) => Promise<string | null>;
};

export const ITEM_VALUE = 'item:';
export const ARGUMENT_VALUE = 'arg:';

// the display environments the fixed Math submenu holds itself
const HELD = new Set(['math:align', 'math:gather', 'math:multline']);

/** the display environments the loaded files give, which the Math submenu lists after its own */
export function loadedMath(items: readonly InsertItem[]): InsertItem[] {
	return items.filter((i) => i.category === 'math' && !HELD.has(i.id));
}

/** the parts the class and packages fill, by category; the common part and the main text are the fixed part's and the
 *  style list's */
export function classParts(items: readonly InsertItem[]): InsertGroup<InsertItem>[] {
	return groupedByCategory(items.filter((i) => !['common', 'mainText', 'math'].includes(i.category)));
}

/** the same parts for the native menu bar */
export function nativeInsertParts(items: readonly InsertItem[]) {
	return classParts(items).map((part) => ({
		label: part.label ?? '',
		items: part.items.map((item) => ({ value: ITEM_VALUE + item.id, label: item.hint ? `${item.label} - ${item.hint}` : item.label }))
	}));
}

/** the arguments Insert offers now, from where the caret is */
export function caretArguments() {
	const view = editorViewStore.current;
	return view && !activeCm() ? insertArguments.current(view.state) : [];
}

function inSource(item: InsertItem): void {
	const cm = activeCm();
	if (!cm) return;
	if (item.shape === 'inline') {
		const { from, to } = cm.state.selection.main;
		return cmReplace(cm, item.source(from === to ? null : cm.state.sliceDoc(from, to)));
	}
	const text = insertSourceOf.current?.(item);
	// the caret at the end of the first line, inside an environment's body
	if (text) cmAfterLine(cm, text, text.includes('\n') ? text.indexOf('\n') : text.length);
}

function inVisual(item: InsertItem, dialect: ReturnType<typeof formatOf>): void {
	const view = editorViewStore.current;
	if (!view) return;
	if (item.shape === 'inline') {
		const { from, to } = view.state.selection;
		const words = dialect === 'tex' ? selectedLatex(view) : from === to ? null : view.state.doc.textBetween(from, to);
		return insertChips([item.source(words)], 'inline', words !== null);
	}
	const tr = insertBlockAtCaret(view.state, item);
	if (tr) view.dispatch(tr);
	view.focus();
}

/** the menu's values of the list and the arguments; false for any other item */
export function makeListInserts(deps: ListInsertDeps): (value: string) => Promise<boolean> {
	return async (value) => {
		if (value.startsWith(ITEM_VALUE)) {
			const item = insertItems.current.find((i) => i.id === value.slice(ITEM_VALUE.length));
			if (item && activeCm()) inSource(item);
			else if (item) inVisual(item, deps.dialect());
			return true;
		}
		if (!value.startsWith(ARGUMENT_VALUE)) return false;
		const argument = caretArguments().find((a) => a.id === value.slice(ARGUMENT_VALUE.length));
		if (!argument) return true;
		const written = argument.asks ? await deps.askText(argument.label, '') : '';
		if (written !== null) runVisualCommand(argument.run(written.trim()));
		return true;
	};
}
