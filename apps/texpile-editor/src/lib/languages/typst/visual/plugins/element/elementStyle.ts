// what a Typst element's arguments look like: the box its fill, inset, stroke and size make, the text its size, color and
// weight make, as CSS the data's parameters say apply
import type { TypstEntry } from '$lib/languages/typst/knowledge';
import {
	namedArg,
	positionalArgs,
	type TypstCall,
	typstLengthCss,
	typstCallStyle,
	cssDeclarations,
	typstTextDeclarations,
	blockStyle,
	horizontalAlignment
} from '$lib/languages/typst/visual/core';

function hasParam(entry: TypstEntry, name: string): boolean {
	return entry.params?.some((param) => param.name === name) ?? false;
}

/** the text between a call's parentheses, where the first positional argument of a text element is its size */
function argsText(call: TypstCall): string {
	return call.open !== null && call.close !== null ? call.source.slice(call.open + 1, call.close) : '';
}

export function elementStyle(call: TypstCall, entry: TypstEntry): Record<string, string> {
	// a styling element (`strong`, `smallcaps`) draws its body in its style
	const style: Record<string, string> = cssDeclarations(typstCallStyle(call.name));
	const [first] = positionalArgs(call);
	const side = first && hasParam(entry, 'alignment') ? horizontalAlignment(first.value) : null;
	if (side) style.textAlign = side;
	if (hasParam(entry, 'size') && hasParam(entry, 'weight')) Object.assign(style, typstTextDeclarations(argsText(call)));
	// the stroke of an underline is its line, not a border
	const boxed = entry.group === 'layout' || entry.group === 'visualize';
	if (!boxed || (!hasParam(entry, 'inset') && !hasParam(entry, 'stroke'))) return style;
	Object.assign(style, blockStyle(call));
	if (entry.group === 'visualize' && !style.border && !style.background) style.border = '1pt solid currentColor';
	if (entry.round) {
		style.borderRadius = '50%';
		const radius = namedArg(call, 'radius');
		const across = radius ? typstLengthCss(radius.node, call.source) : null;
		if (across && !style.width) style.width = `calc(2 * ${across})`;
		if (across && !style.minHeight) style.minHeight = `calc(2 * ${across})`;
	}
	return style;
}
