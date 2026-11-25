// an entry's \bibitem head in its field, and the citations of the old key moved to the new one when it closes
import type { Node } from 'prosemirror-model';
import type { VisualView } from '$lib/editor/canvas';
import { openFieldPanel, placedHost } from '$lib/languages/latex/visual/core';
import { repointCitations } from './repointCitations';

type ItemHead = { key: string; label: string | null };

export function headSource(command: string, head: ItemHead): string {
	return `\\${command}${head.label === null ? '' : `[${head.label}]`}{${head.key}}`;
}

export function readHead(command: string, source: string): ItemHead | null {
	const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const read = new RegExp(`^\\\\${escaped}(?:\\[([^\\]{}]*)\\])?\\{([^{}\\s]*)\\}$`).exec(source);
	return read ? { key: read[2], label: read[1] ?? null } : null;
}

export function headOf(node: Node): ItemHead {
	return { key: String(node.attrs.itemKey ?? ''), label: typeof node.attrs.itemLabel === 'string' ? node.attrs.itemLabel : null };
}

function entryAt(view: VisualView, pos: number): Node | null {
	const node = view.state.doc.nodeAt(pos);
	return node?.type.name === 'list' ? node : null;
}

function writeHead(view: VisualView, pos: number, command: string, next: string): void {
	const node = entryAt(view, pos);
	const head = readHead(command, next);
	if (!node || !head) return;
	const now = headOf(node);
	if (head.key === now.key && head.label === now.label) return;
	const attrs = { ...node.attrs, itemKey: head.key, itemLabel: head.label, itemCmd: node.attrs.itemCmd || command };
	view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
}

/** `box`: where the chip is on screen, which the panel opens under */
export function openBibKeyPanel(view: VisualView, entryPos: () => number, command: string, box: DOMRectReadOnly): void {
	const opened = entryAt(view, entryPos());
	if (!opened) return;
	const from = headOf(opened).key;
	const placed = placedHost(view, () => ({ x: box.left, y: box.top, width: box.width, height: box.height }));
	openFieldPanel({
		anchor: placed.host,
		source: headSource(command, headOf(opened)),
		view,
		write: (next) => writeHead(view, entryPos(), command, next),
		onClose: (how) => {
			placed.remove();
			const entry = entryAt(view, entryPos());
			const to = entry && headOf(entry).key;
			if (to && from !== to) {
				const tr = view.state.tr;
				repointCitations(tr, view.state.doc, from, to);
				if (tr.docChanged) view.dispatch(tr);
			}
			if (how !== 'away') view.focus();
		}
	});
}
