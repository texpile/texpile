import { chipPanelOpenFor, dismissChipPanel, openFieldPanel, syncChipPanel, type KeyedEntry } from '$lib/languages/latex/visual/core';
import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import BibKeyChip from './BibKeyChip.svelte';
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

function headOf(node: Node): ItemHead {
	return { key: String(node.attrs.itemKey ?? ''), label: typeof node.attrs.itemLabel === 'string' ? node.attrs.itemLabel : null };
}

export class BibKeyChipView {
	dom = document.createElement('span');
	private command: string;
	private component: ReturnType<typeof mount>;
	// one $state object: svelte tracks the key only while it lives beside the static props
	private chipProps = $state<{ entryKey: string; onOpen: () => void }>({ entryKey: '', onOpen: () => this.openPanel() });

	constructor(
		private view: EditorView,
		private entryPos: () => number,
		entry: KeyedEntry
	) {
		this.dom.className = 'bib-key';
		this.command = entry.command;
		this.chipProps.entryKey = headOf(entry.node).key;
		this.component = mount(BibKeyChip, { target: this.dom, props: this.chipProps });
	}

	pos(): number {
		return this.entryPos();
	}

	private openPanel(): void {
		const opened = this.entry();
		if (!opened || chipPanelOpenFor(this.dom)) return;
		const from = headOf(opened).key;
		openFieldPanel({
			anchor: this.dom,
			source: headSource(this.command, headOf(opened)),
			view: this.view,
			write: (next) => this.writeHead(next),
			onClose: (how) => {
				const to = this.entry() && headOf(this.entry()!).key;
				if (to && from !== to) this.repoint(from, to);
				if (how !== 'away') this.view.focus();
			}
		});
	}

	private entry(): Node | null {
		const node = this.view.state.doc.nodeAt(this.entryPos());
		return node?.type.name === 'list' ? node : null;
	}

	private writeHead(next: string): void {
		const node = this.entry();
		const head = readHead(this.command, next);
		if (!node || !head) return;
		const now = headOf(node);
		if (head.key === now.key && head.label === now.label) return;
		const attrs = { ...node.attrs, itemKey: head.key, itemLabel: head.label, itemCmd: node.attrs.itemCmd || this.command };
		this.view.dispatch(this.view.state.tr.setNodeMarkup(this.entryPos(), undefined, attrs));
	}

	private repoint(from: string, to: string): void {
		const tr = this.view.state.tr;
		repointCitations(tr, this.view.state.doc, from, to);
		if (tr.docChanged) this.view.dispatch(tr);
	}

	refresh(entry: KeyedEntry): void {
		this.command = entry.command;
		const head = headOf(entry.node);
		this.chipProps.entryKey = head.key;
		if (chipPanelOpenFor(this.dom)) syncChipPanel(this.dom, headSource(this.command, head));
	}

	destroy(): void {
		dismissChipPanel(this.dom);
		void unmount(this.component);
	}
}
