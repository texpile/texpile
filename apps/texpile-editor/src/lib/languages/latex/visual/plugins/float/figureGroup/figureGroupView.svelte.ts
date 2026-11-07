// a figure group: its images in a row over its caption, numbered as a figure, its label in a settings popover
import { compiledNumbersOf } from '$lib/languages/latex/visual/core';
import type { Node } from 'prosemirror-model';
import type { Decoration, EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';

import FigureGroupSettings from './FigureGroupSettings.svelte';
import './figureGroup.css';

export function figureGroupView(
	node: Node,
	view: EditorView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[] = []
): NodeView {
	let currentNode = node;
	const dom = document.createElement('div');
	dom.className = 'figure-group';
	const body = document.createElement('div');
	body.className = 'figure-group-body';
	const settings = document.createElement('div');
	settings.className = 'figure-group-settings';
	settings.contentEditable = 'false';
	dom.append(body, settings);

	function showNumber(given: readonly Decoration[]): void {
		const number = compiledNumbersOf(given)?.[0];
		dom.toggleAttribute('data-numbered', !!number);
		if (number) dom.style.setProperty('--figure-number', JSON.stringify(number));
		else dom.style.removeProperty('--figure-number');
	}
	showNumber(decorations);

	const props = $state({ node: currentNode, view, getPos });
	const component = mount(FigureGroupSettings, { target: settings, props });

	return {
		dom,
		contentDOM: body,
		update(newNode, newDecorations) {
			if (newNode.type !== currentNode.type) return false;
			currentNode = newNode;
			props.node = newNode;
			showNumber(newDecorations);
			return true;
		},
		ignoreMutation: (mutation) => settings.contains(mutation.target),
		stopEvent: (event) => event.target instanceof globalThis.Node && settings.contains(event.target),
		destroy() {
			void unmount(component);
		}
	};
}
