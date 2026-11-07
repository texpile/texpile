// a chip that is one call of Typst's own element that wraps what it is given, and the argument it wraps. Which calls wrap is
// the data's: they print their body, as a transparent element or one of the layout and visualize libraries
import { paramFor, type TypstEntry } from '$lib/languages/typst/knowledge';
import { positionalArgs, type CallArg, readStdUse, type StdUse } from '$lib/languages/typst/visual/core/document';

const BODY = '{body}';
/** the words an element prints before and after its body (`“{body}”` is a quote's) */
export function printedAround(entry: TypstEntry): [string, string] | null {
	const parts = entry.prints?.split(BODY);
	return parts?.length === 2 && !/\{[\w-]+\}/.test(parts.join('')) ? [parts[0], parts[1]] : null;
}

export function wraps(entry: TypstEntry): boolean {
	return printedAround(entry) !== null && (entry.block === 'content' || entry.group === 'layout' || entry.group === 'visualize');
}

// what the box and the text of an element draw from its arguments; the layout and visualize libraries have others
// (an angle, an offset) that the drawing leaves out, so a call given one is not drawn
const SHAPED = ['alignment', 'width', 'height', 'fill', 'stroke'];
const DRAWN = [
	'fill',
	'stroke',
	'inset',
	'outset',
	'width',
	'height',
	'radius',
	'baseline',
	'clip',
	'above',
	'below',
	'spacing',
	'breakable'
];

/** the argument the call fills its body with: the content block after it, else the last positional argument */
function bodyOf(use: StdUse): CallArg | null | undefined {
	const { call, entry } = use;
	if (call.bodies.length > 1) return undefined;
	const positional = positionalArgs(call);
	const body = call.bodies[0] ?? positional[positional.length - 1] ?? null;
	// the arguments before the body: a text element's size, or the positional parameters before its body
	const before = body && !call.bodies.length ? positional.length - 1 : positional.length;
	const sized = entry.params?.some((param) => param.name === 'size') ?? false;
	const filled = Array.from({ length: before }, (_, index) => paramFor(entry, { index })).every(
		(param) => param && SHAPED.includes(param.name)
	);
	return before > 0 && !sized && !filled ? undefined : body;
}

/** whether the call gives nothing the drawing would leave out: a caption it hides, an offset it does not apply */
function drawable(use: StdUse): boolean {
	const typographic = use.entry.group === 'text' || use.entry.block === 'content';
	return use.call.args.every((arg) => {
		if (arg.name === null) return true;
		const param = paramFor(use.entry, { name: arg.name });
		return !param?.content && (typographic || DRAWN.includes(arg.name));
	});
}

/** a chip that is one call wrapping what it is given, and the argument it wraps; null body for a shape with none */
export function readElement(source: string): { use: StdUse; body: CallArg | null } | null {
	const use = readStdUse(source);
	if (!use || !wraps(use.entry) || !drawable(use)) return null;
	const body = bodyOf(use);
	return body === undefined ? null : { use, body };
}
