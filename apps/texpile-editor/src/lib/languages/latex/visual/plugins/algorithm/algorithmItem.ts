import { faceElement, mandatoryArgs, optionalArg, type ChipFace, type TreeCall } from '$lib/languages/latex/visual/core';
import { isItemCommand } from '$lib/languages/latex/knowledge/environments/envFacts';
import { algorithmStep } from './algorithmSteps';
import { keywordPart, type AlgorithmDrawer } from './algorithmFace';

function unbraced(text: string): string {
	let t = text.trim();
	while (/^\{[^{}]*\}$|^\{\{.*\}\}$/.test(t)) t = t.slice(1, -1).trim();
	return t;
}

export function drawsAsItem(name: string): boolean {
	return isItemCommand(name);
}

export function itemPart(call: TreeCall, src: string, drawer: AlgorithmDrawer): ChipFace | null | undefined {
	const label = optionalArg(call);
	if (!isItemCommand(call.name) || !label?.body || mandatoryArgs(call).length) return undefined;
	const written = src.slice(label.body.from, label.body.to);
	const step = algorithmStep(unbraced(written));
	let head: ChipFace | null = null;
	if (step) head = step.say ? keywordPart(step.say, step.key, drawer) : null;
	else {
		const drawn = drawer.drawSource(`\\textbf{${written}}`);
		if (!drawn) return null;
		head = drawn;
	}
	if (step?.say && !head) return null;
	const dom = faceElement('span', 'drawn-algorithm-item');
	dom.append(document.createElement('br'));
	if (head) dom.append(head.dom);
	return { dom, mixed: true, destroy: () => head?.destroy?.() };
}
