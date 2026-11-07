import type { SyntaxNode } from '@lezer/common';
import {
	documentTable,
	environmentName,
	faceElement,
	hasArgs,
	readEnvironment,
	type ChipFace,
	type SourceUnit,
	type UnitsDrawer
} from '$lib/languages/latex/visual/core';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { floatTypes } from '$lib/languages/latex/knowledge/registries/floatTypes';
import './floats.css';

export function isFloatEnvironment(name: string): boolean {
	return floatTypes().has(name.replace(/\*$/, ''));
}

function aligns(u: SourceUnit): boolean {
	return !!u.call && !hasArgs(u.call) && commonFacts(u.call.name).declares === 'align';
}

export function floatPart(node: SyntaxNode, src: string, drawer: UnitsDrawer): ChipFace | null {
	if (node.name !== 'Environment' || !node.firstChild) return null;
	const name = environmentName(src, node.firstChild);
	if (!isFloatEnvironment(name)) return null;
	const { envs } = documentTable.current;
	const env = readEnvironment(src, node, Object.hasOwn(envs, name) ? envs[name] : [{ kind: 'o' }]);
	const parts = drawer.draw(drawer.unitsOf(env.body).filter((u) => !aligns(u)));
	if (!parts?.length) return null;
	const dom = faceElement('div', 'drawn-float');
	dom.dataset.env = name;
	dom.append(...parts.map((part) => part.dom));
	return {
		dom,
		line: true,
		decorate: (decorations) => parts.forEach((part) => part.decorate?.(decorations)),
		destroy: () => parts.forEach((part) => part.destroy?.())
	};
}
