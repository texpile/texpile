// math that holds a command written as an environment (\begin{footnote}{...}\end{footnote}), which LaTeX runs as the
// command: the formula, then what the command draws
import type { SyntaxNode } from '@lezer/common';
import { faceOfParts, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { commonCommand, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { bodyOf, childrenIn, environmentName } from '$lib/languages/latex/parser/tree/walk/stretch';
import { documentTable } from '../title/documentTable.svelte';
import { mathFace } from './mathPart';

const INLINE = new Set(['InlineMath', 'ParenMath']);
const DISPLAY = new Set(['DisplayMath', 'BracketMath']);

/** a command of text no loaded file makes an environment of */
function runsAsCommand(name: string): boolean {
	if (Object.hasOwn(documentTable.current.envs, name) || Object.keys(commonEnvFacts(name)).length) return false;
	return !!commonCommand(name)?.args.some((a) => rolesOf(a).includes('text'));
}

export function mathWithCallsPart(node: SyntaxNode, src: string, drawSource: (latex: string) => ChipFace | null): ChipFace | null {
	if (!INLINE.has(node.name) && !DISPLAY.has(node.name)) return null;
	const body = bodyOf(node);
	const calls = childrenIn(body).filter(
		(child) => child.name === 'Environment' && !!child.firstChild && runsAsCommand(environmentName(src, child.firstChild))
	);
	if (!calls.length) return null;
	let latex = '';
	let at = body.from;
	const parts: ChipFace[] = [];
	function fail(): null {
		parts.forEach((part) => part.destroy?.());
		return null;
	}
	for (const env of calls) {
		latex += src.slice(at, env.from);
		at = env.to;
		const inner = bodyOf(env);
		const drawn = drawSource(`\\${environmentName(src, env.firstChild!)}${src.slice(inner.from, inner.to)}`);
		if (!drawn) return fail();
		parts.push(drawn);
	}
	const formula = mathFace({ latex: latex + src.slice(at, body.to), block: DISPLAY.has(node.name) });
	if (!formula) return fail();
	return faceOfParts([formula, ...parts], DISPLAY.has(node.name));
}
