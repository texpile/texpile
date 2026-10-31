import { describe, expect, it, vi } from 'vitest';

// a tinymist that starts and then never answers an export, as a stuck picture does
vi.mock('../../../../../../electron/src/typstService', () => ({
	resolveTinymist: async () => ({ command: 'tinymist' }),
	startLsp: (_command: string, _dir: string, on: { message: (json: string) => void }) => ({
		send(json: string) {
			const msg = JSON.parse(json) as { id?: number; method: string };
			if (msg.method === 'initialize') setTimeout(() => on.message(JSON.stringify({ id: msg.id, result: {} })), 1);
		},
		stop() {}
	})
}));

const { renderCetz, stopCetz } = await import('../../../../../../electron/src/draw/cetzEngine');

describe('the CeTZ engine stopped mid-picture', () => {
	it('answers the waiting picture, and the next picture still runs', async () => {
		const first = renderCetz('/tmp', '#circle()');
		await new Promise((r) => setTimeout(r, 20));
		stopCetz();
		await expect(first).resolves.toMatchObject({ svg: null, errors: ['tinymist stopped.'] });
		const second = renderCetz('/tmp', '#circle()');
		await new Promise((r) => setTimeout(r, 20));
		stopCetz();
		await expect(second).resolves.toMatchObject({ errors: ['tinymist stopped.'] });
	}, 3000);
});
