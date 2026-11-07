// @vitest-environment jsdom
// a package's picture call drawn as a card named for the package, never as an engine's drawing
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { typstDrawnCommand } from '$lib/languages/typst/visual/convert/calls/drawnCommand';
import { scopeOfFile, typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

describe('picture faces', () => {
	it('draws a diagram call as a card with the package and function, kept apart from the code beside it', async () => {
		typstScopeNow.current = await scopeOfFile('#import "@preview/fletcher:0.5.8": diagram, node, edge\n', null);
		const source = '#diagram(node((0, 0), [A]), node((1, 0), [B]), edge((0, 0), (1, 0), "->"))';
		const face = typstFace(source);
		expect(face?.line).toBe(true);
		expect(face?.dom.textContent).toContain('fletcher');
		expect(face?.dom.textContent).toContain('diagram');
		expect(typstDrawnCommand(source)).toBe(true);
	});

	it('draws a call lifted out of a code block, written without its hash', async () => {
		typstScopeNow.current = await scopeOfFile('#import "@preview/commute:0.3.0": commutative-diagram, node\n', null);
		expect(typstFace('commutative-diagram(node((0, 0), [A]))')?.dom.textContent).toContain('commute');
	});
});
