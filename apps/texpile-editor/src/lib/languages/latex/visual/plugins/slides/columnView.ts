import {
	chipPanelOpenFor,
	dismissChipPanel,
	isReadOnly,
	openChipPanel,
	redoVisual,
	syncChipPanel,
	texLength,
	undoVisual
} from '$lib/languages/latex/visual/core';
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { m } from '$lib/paraglide/messages';

import { readColumnWidth } from './columnWidth';
import { changeKeepingSource } from './keepSource';

export function columnView(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
	let current = node;

	const dom = document.createElement('div');
	dom.className = 'beamer-column';

	const head = document.createElement('div');
	head.className = 'beamer-column-width';
	head.contentEditable = 'false';
	const chip = document.createElement('button');
	chip.type = 'button';
	chip.className = 'beamer-column-chip';
	chip.setAttribute('aria-label', m.slide_column_width());
	head.appendChild(chip);
	dom.appendChild(head);

	const content = document.createElement('div');
	content.className = 'beamer-column-content';
	dom.appendChild(content);

	function show(next: Node) {
		const width = String(next.attrs.width);
		const length = texLength(width);
		const share = length && 'share' in length && length.share > 0 ? Math.min(length.share, 1) : null;
		dom.style.flex = share === null ? '1 1 0' : `0 1 ${share * 100}%`;
		chip.textContent = width;
		chip.disabled = isReadOnly.current;
	}
	show(node);

	function writeWidth(next: string) {
		const pos = getPos();
		const width = readColumnWidth(next);
		if (pos === undefined || width === null || width === current.attrs.width) return;
		changeKeepingSource(view, pos, current, (tr) => tr.setNodeMarkup(pos, undefined, { ...current.attrs, width }));
	}

	chip.addEventListener('click', () => {
		if (chipPanelOpenFor(chip)) return;
		openChipPanel({
			anchor: chip,
			source: String(current.attrs.width),
			language: 'latex',
			inline: true,
			settingsFor: () => null,
			write: writeWidth,
			writeSetting: writeWidth,
			jump: () => {},
			jumpToDefinition: () => {},
			view,
			undo: () => undoVisual(),
			redo: () => redoVisual(),
			onClose: (how) => {
				if (how !== 'away') view.focus();
			}
		});
	});

	return {
		dom,
		contentDOM: content,
		update(next) {
			if (next.type !== current.type) return false;
			current = next;
			show(next);
			if (chipPanelOpenFor(chip)) syncChipPanel(chip, String(next.attrs.width));
			return true;
		},
		ignoreMutation: (mutation) => head.contains(mutation.target as HTMLElement) || mutation.target === head,
		stopEvent: (event) => event.target instanceof HTMLElement && head.contains(event.target),
		destroy() {
			dismissChipPanel(chip);
		}
	};
}
