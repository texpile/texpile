// a list the document keeps where the editor has no list to put it in (inside an argument, or items wrapped in a group), as
// the page prints it
import { faceOfParts, tip, type ChipFace } from '$lib/languages/latex/visual/core';
import './listEnvironment.css';

export type ListItemParts = { label: ChipFace[] | null; body: ChipFace[] };

const HINT_LENGTH = 400;

function tagOf(name: string): 'ol' | 'ul' | 'dl' {
	if (name === 'enumerate') return 'ol';
	return name === 'description' ? 'dl' : 'ul';
}

export function listEnvironmentFace(name: string, items: ListItemParts[], source: string): ChipFace {
	const tag = tagOf(name);
	const dom = document.createElement(tag);
	dom.className = `drawn-list drawn-list-${tag}`;
	const owned: ChipFace[] = [];
	function fill(parent: HTMLElement, parts: ChipFace[]): void {
		const face = faceOfParts(parts, false);
		owned.push(face);
		parent.appendChild(face.dom);
	}
	for (const { label, body } of items) {
		if (tag === 'dl') {
			if (label) fill(dom.appendChild(document.createElement('dt')), label);
			fill(dom.appendChild(document.createElement('dd')), body);
		} else {
			const item = dom.appendChild(document.createElement('li'));
			if (label) fill(item.appendChild(document.createElement('strong')), label);
			fill(item, body);
		}
	}
	const hint = source.replace(/\s+/g, ' ').trim();
	const tipped = tip(dom, hint.length > HINT_LENGTH ? hint.slice(0, HINT_LENGTH) + '…' : hint);
	return {
		dom,
		line: true,
		decorate: (decorations) => owned.forEach((face) => face.decorate?.(decorations)),
		destroy() {
			owned.forEach((face) => face.destroy?.());
			tipped.destroy();
		}
	};
}
