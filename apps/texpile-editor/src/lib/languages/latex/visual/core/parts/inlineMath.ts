// whether a tree node is an inline formula, which a drawn chip typesets inside its text ($x$ in \textbf{...})
const INLINE_MATH = new Set(['InlineMath', 'ParenMath']);

export function isInlineMath(name: string | null): boolean {
	return name !== null && INLINE_MATH.has(name);
}
