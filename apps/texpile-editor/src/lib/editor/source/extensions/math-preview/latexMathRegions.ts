// the math of a LaTeX text, read off its syntax tree
import type { SyntaxNode } from '@lezer/common';
import { commonEnvFacts, hasMathBody } from '$lib/languages/latex/knowledge/environments/envFacts';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';
import type { MathRegion } from './mathScanner';

const DISPLAY_NODES = new Set(['DisplayMath', 'BracketMath']);
const MATH_NODES = new Set(['InlineMath', 'ParenMath', 'OwnMath', ...DISPLAY_NODES]);

function closerOf(node: SyntaxNode): SyntaxNode | null {
	const last = node.lastChild;
	return last && last.name !== 'MathEnd' && last.name !== 'EnvEnd' && last.from > node.from ? last : null;
}

function mathRegion(node: SyntaxNode): MathRegion {
	const closer = closerOf(node);
	const region: MathRegion = {
		from: node.from,
		to: node.to,
		innerFrom: node.firstChild!.to,
		innerTo: closer ? closer.from : node.to,
		kind: DISPLAY_NODES.has(node.name) ? 'display' : 'inline'
	};
	if (!closer) region.unclosed = true;
	return region;
}

// an environment left open ends at its first blank line
function environmentRegion(node: SyntaxNode, env: string): MathRegion {
	const region = mathRegion(node);
	region.env = env;
	region.kind = commonEnvFacts(env).body === 'math-inline' ? 'inline' : 'display';
	if (region.unclosed) {
		const blank = node.getChild('ParBreak');
		if (blank) region.innerTo = region.to = blank.from;
	}
	return region;
}

// the region a node is, if it is math
function regionOf(text: string, node: SyntaxNode): MathRegion | null {
	if (MATH_NODES.has(node.name)) return mathRegion(node);
	if (node.name !== 'Environment' || !node.firstChild) return null;
	const env = environmentName(text, node.firstChild);
	return hasMathBody(commonEnvFacts(env)) ? environmentRegion(node, env) : null;
}

export function findLatexMathRegions(text: string): MathRegion[] {
	const regions: MathRegion[] = [];
	latexTreeOf(text).iterate({
		enter(node) {
			if (!MATH_NODES.has(node.name) && node.name !== 'Environment') return;
			const region = regionOf(text, node.node);
			if (!region) return;
			regions.push(region);
			return false;
		}
	});
	return regions;
}

/** the region `mathRegionAt` finds at `pos` in the list above, read off the nodes around `pos` alone */
export function latexMathRegionAt(text: string, pos: number): MathRegion | null {
	let found: MathRegion | null = null;
	for (let node: SyntaxNode | null = latexTreeOf(text).resolveInner(pos, -1); node; node = node.parent) {
		const region = regionOf(text, node);
		// the outermost wins, as the list holds no math inside math
		if (region && region.from < pos && pos <= region.to) found = region;
	}
	return found;
}
