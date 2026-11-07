import { mount, unmount } from 'svelte';
import { faceElement, FigurePlaceholder, type ChipFace } from '$lib/languages/latex/visual/core';
import './pictures.css';

export function pictureFace(title: string, summary: string): ChipFace {
	const dom = faceElement('div', 'drawn-picture');
	const placeholder = mount(FigurePlaceholder, { target: dom, props: { title, summary } });
	return { dom, line: true, destroy: () => void unmount(placeholder) };
}
