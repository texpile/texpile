import { tippedFace, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { readSymbol } from './symbolCall';
import { symbolDocument } from './document';

export const symbol: TypstPlugin = {
	functions: ['sym', 'emoji'],
	face({ source }) {
		const character = readSymbol(source);
		if (!character) return null;
		const dom = document.createElement('span');
		dom.textContent = character;
		return tippedFace(dom, source, { character: true });
	},
	document: symbolDocument
};
