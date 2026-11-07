// whether a content block's rules only set how its own words look (`#[#set text(fill: red); words]`), each value written
// out, so the block opens as its words with each rule a setting line among them
import type { SyntaxNode } from '@lezer/common';
import { readTypstCall, type CallArg } from '../../core/reading/typstCall';
import { typstColorCss } from '../../extensions/css/typstColor';
import { children, childOf } from '../reading/syntaxUtils';

const STYLED = new Set(['text', 'par']);
const WRITTEN = new Set(['Str', 'Int', 'Float', 'Numeric', 'Bool', 'None', 'Auto', 'Ident']);

function written(arg: CallArg, source: string): boolean {
	return WRITTEN.has(arg.kind) || (arg.kind === 'FuncCall' && typstColorCss(arg.node, source) !== null);
}

/** a set rule on text or paragraphs, every value written out */
export function isStyleRule(rule: SyntaxNode, src: string): boolean {
	const call = readTypstCall(`#${src.slice(rule.from, rule.to)}`);
	return (
		!!call &&
		call.form === 'set' &&
		STYLED.has(call.name) &&
		call.bodies.length === 0 &&
		call.args.every((arg) => written(arg, call.source))
	);
}

/** at least one rule, and every rule of the block a set rule on its text or paragraphs */
export function setsOnlyStyle(block: SyntaxNode, src: string): boolean {
	const markup = childOf(block, 'Markup');
	if (!markup) return false;
	let rules = 0;
	for (const kid of children(markup)) {
		if (kid.name === 'ShowRule') return false;
		if (kid.name !== 'SetRule') continue;
		if (!isStyleRule(kid, src)) return false;
		rules++;
	}
	return rules > 0;
}
