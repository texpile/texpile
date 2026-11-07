const INLINE_MATH = new Set(['InlineMath', 'ParenMath']);

export function isInlineMath(name: string | null): boolean {
	return name !== null && INLINE_MATH.has(name);
}
