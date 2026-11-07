import type { SyntaxNode } from '@lezer/common';
import {
	documentTable,
	environmentName,
	faceElement,
	mandatoryArgs,
	optionalArg,
	ownMacroDefinition,
	readEnvironment,
	trimmedParts,
	type ChipFace,
	type SourceUnit,
	type Stretch,
	type TreeArg,
	type TreeCall
} from '$lib/languages/latex/visual/core';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { algorithmStep, type AlgorithmStep } from './algorithmSteps';
import './algorithm.css';

export type AlgorithmDrawer = {
	unitsOf(s: Stretch): SourceUnit[];
	draw(units: SourceUnit[]): ChipFace[] | null;
	drawSource(latex: string): ChipFace | null;
};

export function isAlgorithmEnvironment(name: string): boolean {
	const { bodies } = documentTable.current;
	const readings = [...(Object.hasOwn(bodies, name) ? [bodies[name]] : []), commonEnvFacts(name)];
	return readings.some((facts) => (facts.item ?? []).some((item) => algorithmStep(item) !== null));
}

export function keywordPart(say: string, key: string | undefined, drawer: AlgorithmDrawer): ChipFace | null {
	if (key && ownMacroDefinition(`algorithmic${key}`)) return drawer.drawSource(`\\algorithmic${key}`);
	const dom = document.createElement('strong');
	dom.textContent = say;
	return { dom };
}

export function commentPart(parts: ChipFace[]): ChipFace {
	const dom = faceElement('span', 'drawn-algorithm-comment');
	dom.append('▷ ', ...parts.map((part) => part.dom));
	return { dom, destroy: () => parts.forEach((part) => part.destroy?.()) };
}

type Line = { depth: number; step: AlgorithmStep; call: TreeCall; rest: SourceUnit[]; comments: TreeArg[] };

function isBlank(u: SourceUnit): boolean {
	return u.piece.kind === 'space' || (u.piece.kind === 'node' && (u.piece.node.name === 'Comment' || u.piece.node.name === 'ParBreak'));
}

function linesOf(units: SourceUnit[]): Line[] | null {
	const lines: Line[] = [];
	let depth = 0;
	for (const u of units) {
		const step = u.call ? algorithmStep(u.call.name) : null;
		const last = lines[lines.length - 1];
		if (u.call && step?.comment && last) last.comments.push(...mandatoryArgs(u.call));
		else if (u.call && step) {
			if (step.closes) depth = Math.max(0, depth - 1);
			lines.push({ depth, step, call: u.call, rest: [], comments: [] });
			if (step.opens) depth++;
		} else if (last) last.rest.push(u);
		else if (!isBlank(u)) return null;
	}
	return lines;
}

function lineFace(line: Line, number: number | null, drawer: AlgorithmDrawer): ChipFace | null {
	const groups: ChipFace[][] = [];
	function parts(): ChipFace[] {
		return groups.flat();
	}
	function fail(): null {
		parts().forEach((part) => part.destroy?.());
		return null;
	}
	function add(drawn: ChipFace[] | ChipFace | null): boolean {
		const list = drawn === null ? null : [drawn].flat();
		if (list?.some((part) => part.line)) list.forEach((part) => part.destroy?.());
		if (!list || list.some((part) => part.line)) return false;
		if (list.length) groups.push(list);
		return true;
	}
	function words(arg: TreeArg): ChipFace[] | null {
		return arg.body ? drawer.draw(drawer.unitsOf(arg.body)) : [];
	}
	const { step, call } = line;
	if (step.say && !add(keywordPart(step.say, step.key, drawer))) return fail();
	for (const arg of mandatoryArgs(call)) if (!add(words(arg))) return fail();
	if (!add(trimmedParts(drawer.draw(line.rest)))) return fail();
	if (step.then && !add(keywordPart(step.then.say, step.then.key, drawer))) return fail();
	const remark = optionalArg(call);
	for (const arg of [...(remark ? [remark] : []), ...line.comments]) {
		const drawn = words(arg);
		if (!drawn || !add(commentPart(drawn))) return fail();
	}
	const dom = faceElement('div', 'drawn-algorithm-line');
	dom.style.paddingInlineStart = `${line.depth * 1.5}em`;
	if (number !== null) {
		const mark = faceElement('span', 'drawn-algorithm-number', `${number}:`);
		dom.append(mark);
	}
	groups.forEach((group, i) => {
		if (i) dom.append(' ');
		dom.append(...group.map((part) => part.dom));
	});
	return { dom, destroy: () => parts().forEach((part) => part.destroy?.()) };
}

export function algorithmPart(node: SyntaxNode, src: string, drawer: AlgorithmDrawer): ChipFace | null {
	if (node.name !== 'Environment' || !node.firstChild) return null;
	const name = environmentName(src, node.firstChild);
	if (!isAlgorithmEnvironment(name)) return null;
	const { envs } = documentTable.current;
	const env = readEnvironment(src, node, Object.hasOwn(envs, name) ? envs[name] : [{ kind: 'o' }]);
	const lines = linesOf(drawer.unitsOf(env.body));
	if (!lines?.length) return null;
	const given = env.args.find((a) => a.present && a.open === '[');
	const every = given?.body ? Number(src.slice(given.body.from, given.body.to).trim()) || 0 : 0;
	const dom = faceElement('div', 'drawn-algorithm');
	const drawn: ChipFace[] = [];
	for (const [i, line] of lines.entries()) {
		const face = lineFace(line, every > 0 && (i + 1) % every === 0 ? i + 1 : null, drawer);
		if (!face) {
			drawn.forEach((part) => part.destroy?.());
			return null;
		}
		drawn.push(face);
		dom.append(face.dom);
	}
	return { dom, line: true, destroy: () => drawn.forEach((part) => part.destroy?.()) };
}
