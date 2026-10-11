import { expect, it } from 'vitest';
import { callLookCss } from '$lib/editor/snippets/visual/callLookStyles';
import { readCallLook } from '$lib/editor/snippets/file/readCallLook';
import type { CallLook } from '$lib/editor/snippets/file/snippetTypes';

it('a label from a shared snippet file stays inside its CSS string', () => {
	const look = readCallLook({ label: 'x" } body { display: none } "', background: 'yellow' }) as CallLook;
	const css = callLookCss('typst', new Map([['offen', look]]));
	expect(css).toContain('content: "x\\" } body { display: none } \\""');
	expect(readCallLook({ color: 'teal' })).toBe('visual.color is not one of red, orange, yellow, green, blue, purple, gray');
});
