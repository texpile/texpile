// where an equation's closing dollar goes: after a line comment it would be part of the comment
import { TypstParser } from 'texpile-typst-syntax-wasm';

let parser: TypstParser | null = null;

/** true when the math `inner` ends inside a `//` comment, which runs on to the end of its line */
export function endsInLineComment(inner: string): boolean {
	if (!inner.includes('//')) return false;
	parser ??= new TypstParser();
	const end = inner.length + 1;
	for (let node = parser.parse(`$${inner}\n$`).resolveInner(end, -1); node.parent; node = node.parent)
		if (node.name === 'LineComment') return node.to >= end;
	return false;
}
