import { it, expect } from 'vitest';
import markdownit from 'markdown-it';
import { createMarkdownEngine } from '$lib/languages/markdown/engine';
import { rangeOf } from '$lib/languages/markdown/positions';

// every parse makes an engine of its own, and each one wrapped the shared pushPending once more, until a long session ran out of stack
it('stamps inline positions without touching the inline state every markdown-it instance shares', () => {
	const shared = markdownit().inline.State.prototype.pushPending;
	const md = createMarkdownEngine();
	createMarkdownEngine();
	expect(markdownit().inline.State.prototype.pushPending).toBe(shared);
	const inline = md.parse('Some *words* here.', {}).find((t) => t.type === 'inline')!;
	expect(inline.children!.map((t) => [t.content, rangeOf(t)])).toContainEqual(['Some ', { from: 0, to: 5 }]);
});
