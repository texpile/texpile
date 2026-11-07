import type { Node } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import FrameChrome from './FrameChrome.svelte';
import { changeKeepingSource } from '../keepSource';

function holdsTitlePage(node: Node): boolean {
	return node.childCount === 1 && node.firstChild!.type.name === 'raw_latex' && /^\\titlepage\b/.test(node.firstChild!.textContent.trim());
}

export function frameView(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
	let current = node;

	const dom = document.createElement('div');
	dom.className = 'beamer-frame';

	const chrome = document.createElement('div');
	chrome.className = 'beamer-frame-chrome';
	chrome.contentEditable = 'false';
	dom.appendChild(chrome);

	const content = document.createElement('div');
	content.className = 'beamer-frame-content';
	dom.appendChild(content);

	function mark(next: Node) {
		dom.dataset.form = String(next.attrs.form);
		dom.classList.toggle('is-title-slide', holdsTitlePage(next));
		dom.classList.toggle('is-unnumbered', /\bnoframenumbering\b/.test(String(next.attrs.options)));
	}
	mark(node);

	function updateAttrs(attrs: Record<string, unknown>) {
		const pos = getPos();
		if (pos === undefined) return;
		changeKeepingSource(view, pos, current, (tr) => tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }));
	}

	function addPart(type: 'frame_title' | 'frame_subtitle') {
		const pos = getPos();
		if (pos === undefined) return;
		// a line of its own: an argument would rewrite the frame's first line, and the comments on it
		const part = view.state.schema.nodes[type].create({ form: 'macro' });
		const at = pos + 1 + (type === 'frame_subtitle' && current.firstChild?.type.name === 'frame_title' ? current.firstChild.nodeSize : 0);
		changeKeepingSource(view, pos, current, (tr) => {
			tr.insert(at, part);
			tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
		});
		view.focus();
	}

	const props = $state({ node, updateAttrs, addPart, titleSlide: holdsTitlePage(node) });
	const component = mount(FrameChrome, { target: chrome, props });

	return {
		dom,
		contentDOM: content,
		update(next) {
			if (next.type !== current.type) return false;
			current = next;
			props.node = next;
			props.titleSlide = holdsTitlePage(next);
			mark(next);
			return true;
		},
		ignoreMutation: (mutation) => chrome.contains(mutation.target as HTMLElement) || mutation.target === chrome,
		stopEvent: (event) => event.target instanceof HTMLElement && chrome.contains(event.target),
		destroy: () => unmount(component)
	};
}
