import type { Node } from 'prosemirror-model';
import type { Decoration, EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import {
	chipPanelOpenFor,
	dismissChipPanel,
	openChipPanel,
	syncChipPanel
} from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import EnvironmentHead from './EnvironmentHead.svelte';
import { environmentHeadSource, readEnvironmentHead } from './environmentHeadSource';
import './environment.css';

function numberOf(decorations: readonly Decoration[]): string | null {
	const numbers = decorations.find((d) => (d.spec as { numbers?: string[] }).numbers)?.spec.numbers as string[] | undefined;
	return numbers?.[0] ?? null;
}

export function environmentView(
	node: Node,
	view: EditorView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[] = []
): NodeView {
	let currentNode = node;

	const dom = document.createElement('div');
	dom.className = 'tex-environment';
	dom.setAttribute('data-env', String(node.attrs.name ?? 'environment'));

	const header = document.createElement('div');
	header.className = 'env-header';
	header.contentEditable = 'false';
	dom.appendChild(header);

	const contentDom = document.createElement('div');
	contentDom.className = 'tex-environment-body';
	dom.appendChild(contentDom);

	function writeHead(next: string) {
		const pos = getPos();
		const head = readEnvironmentHead(next);
		if (pos === undefined || !head) return;
		if (head.name === currentNode.attrs.name && head.args === (currentNode.attrs.args ?? '')) return;
		view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, ...head }));
	}

	function openSettings() {
		if (chipPanelOpenFor(header)) return;
		openChipPanel({
			anchor: header,
			source: environmentHeadSource(currentNode),
			language: 'latex',
			inline: false,
			settingsFor: () => null,
			write: writeHead,
			writeSetting: writeHead,
			jump: () => {},
			jumpToDefinition: () => {},
			view,
			undo: () => undoVisual(),
			redo: () => redoVisual(),
			onClose: (how) => {
				if (how !== 'away') view.focus();
			}
		});
	}

	const props = $state({ node: currentNode, onopen: openSettings, number: numberOf(decorations) });
	const component = mount(EnvironmentHead, { target: header, props });

	return {
		dom,
		contentDOM: contentDom,
		update(newNode, newDecorations) {
			if (newNode.type !== currentNode.type) return false;
			currentNode = newNode;
			props.node = newNode;
			props.number = numberOf(newDecorations);
			if (chipPanelOpenFor(header)) syncChipPanel(header, environmentHeadSource(newNode));
			dom.setAttribute('data-env', String(newNode.attrs.name ?? 'environment'));
			return true;
		},
		// ignore mutations inside the svelte header, PM owns the body
		ignoreMutation(mutation) {
			return header.contains(mutation.target as HTMLElement) || mutation.target === header;
		},
		stopEvent(event) {
			const t = event.target;
			return t instanceof HTMLElement && header.contains(t);
		},
		destroy() {
			dismissChipPanel(header);
			unmount(component);
		}
	};
}
