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

const HELD = new Set(['math:align', 'math:gather', 'math:multline']);

export function loadedMath(items: readonly InsertItem[]): InsertItem[] {
	return items.filter((i) => i.category === 'math' && !HELD.has(i.id));
}

export function classParts(items: readonly InsertItem[]): InsertGroup<InsertItem>[] {
	return groupedByCategory(items.filter((i) => !['common', 'mainText', 'math'].includes(i.category)));
}

export function nativeInsertParts(items: readonly InsertItem[]) {
	return classParts(items).map((part) => ({
		label: part.label ?? '',
		items: part.items.map((item) => ({ value: ITEM_VALUE + item.id, label: item.hint ? `${item.label} - ${item.hint}` : item.label }))
	}));
}

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
