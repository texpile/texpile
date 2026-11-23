import { faceElement } from '$lib/editor/canvas';
import { tippedFace, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { readSymbol } from './symbolCall';
import { symbolDocument } from './document';

export const symbol: TypstPlugin = {
	functions: ['sym', 'emoji'],
	face({ source }) {
		const character = readSymbol(source);
		if (!character) return null;
		return tippedFace(faceElement('span', '', character), source, { character: true });
	},
	document: symbolDocument
};
