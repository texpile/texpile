import { describe, expect, it, vi } from 'vitest';

let stops = 0;
// a tinymist that answers each export a moment later, with no page
vi.mock('../../../../../../electron/src/typstService', () => ({
	resolveTinymist: async () => ({ command: 'tinymist' }),
	startLsp: (_command: string, _dir: string, on: { message: (json: string) => void }) => ({
		send(json: string) {
			const msg = JSON.parse(json) as { id?: number; method: string };
			if (msg.method === 'initialize') setTimeout(() => on.message(JSON.stringify({ id: msg.id, result: {} })), 1);
			if (msg.method === 'workspace/executeCommand')
				setTimeout(() => on.message(JSON.stringify({ id: msg.id, result: { items: [] } })), 30);
		},
		stop() {
			stops++;
		}
	})
}));

const { releaseCetz, renderCetz } = await import('../../../../../../electron/src/draw/cetzEngine');

describe('the CeTZ engine shared by two windows', () => {
	it('keeps drawing for one window when the other lets go, and stops once both have', async () => {
		const first = renderCetz('/tmp', '#circle()', 1);
		const second = renderCetz('/tmp', '#circle()', 2);
		await new Promise((r) => setTimeout(r, 10));
		releaseCetz(1);
		await expect(first).resolves.toMatchObject({ errors: ['Typst gave no page.'] });
		await expect(second).resolves.toMatchObject({ errors: ['Typst gave no page.'] });
		expect(stops).toBe(0);
		releaseCetz(2);
		await vi.waitFor(() => expect(stops).toBe(1));
	}, 3000);
});
