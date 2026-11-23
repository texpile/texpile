// the table float as TableWrapperComponent and its node view drew it: the chrome over the caption, the caption, the table and the notes
import type { CanvasNodeViewConstructor } from '$lib/editor/canvas';
import { setLook } from '$lib/editor/canvas';
import { CHROME_LOOK, CONTENT_LOOK, TOOLS_LOOK, WRAPPER_LOOK } from './tableLooks';
import { noteHandedNumber } from './tableNumbers';

export function tableWrapperView(
	...[node, view, , decorations]: Parameters<CanvasNodeViewConstructor>
): ReturnType<CanvasNodeViewConstructor> {
	const { el } = view.canvas.build;
	let current = node;
	let handed = noteHandedNumber(node, decorations);
	const dom = el('div', 'table-wrapper');
	setLook(dom, WRAPPER_LOOK);
	if (node.attrs.label) dom.setAttribute('data-label', String(node.attrs.label));
	const mount = dom.appendChild(el('div'));
	mount.setAttribute('contenteditable', 'false');
	const chrome = mount.appendChild(el('div', 'table-chrome'));
	setLook(chrome, CHROME_LOOK);
	const tools = chrome.appendChild(el('div', 'table-tools'));
	tools.anchor = 'tools';
	setLook(tools, TOOLS_LOOK);
	const content = dom.appendChild(el('div', node.attrs.showNotes ? 'table-wrapper-content' : 'table-wrapper-content hide-notes'));
	setLook(content, CONTENT_LOOK);
	return {
		dom,
		contentDOM: content,
		// a new number builds the caption again, which prints it
		update(next, nextDecorations) {
			const nextHanded = noteHandedNumber(next, nextDecorations);
			if (!next.sameMarkup(current) || nextHanded !== handed) return false;
			current = next;
			handed = nextHanded;
			return true;
		}
	};
}
