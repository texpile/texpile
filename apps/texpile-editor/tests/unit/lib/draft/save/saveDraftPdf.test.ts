import { it, expect } from 'vitest';
import { saveDraftPdf } from '$lib/draft/save/saveDraftPdf';

function deps(compiled = true) {
	const order: string[] = [];
	return {
		order,
		settleEdits: async () => void order.push('settle'),
		compile: async () => {
			order.push('compile');
			return compiled;
		},
		save: async () => {
			order.push('save');
			return { saved: true, path: '/out/main.pdf' };
		}
	};
}

// an adopted patch repaints the canvas with no pass behind it, and nothing was pending to say so:
// the copy went out without the last edit
it('runs a full pass before every save, with nothing pending', async () => {
	const d = deps();
	expect(await saveDraftPdf(d)).toEqual({ saved: true, path: '/out/main.pdf' });
	expect(d.order).toEqual(['settle', 'compile', 'save']);
});

it('offers no dialog when the pass leaves no PDF', async () => {
	const d = deps(false);
	expect(await saveDraftPdf(d)).toBeNull();
	expect(d.order).not.toContain('save');
});
