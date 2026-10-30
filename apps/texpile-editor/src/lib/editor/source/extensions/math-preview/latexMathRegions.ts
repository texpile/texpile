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

export function findLatexMathRegions(text: string): MathRegion[] {
	const regions: MathRegion[] = [];
	latexTreeOf(text).iterate({
		enter(node) {
			if (MATH_NODES.has(node.name)) regions.push(mathRegion(node.node));
			else if (node.name === 'Environment' && node.node.firstChild) {
				const env = environmentName(text, node.node.firstChild);
				if (!hasMathBody(commonEnvFacts(env))) return;
				regions.push(environmentRegion(node.node, env));
			} else return;
			return false;
		}
	});
	return regions;
}
