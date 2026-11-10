// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('$lib/workspace/fileSystem', () => ({
	nativeBridge: () => ({
		figureRead: async (name: string) => (store.has(name) ? { svg: store.get(name), mtimeMs: 1 } : null),
		figureWrite: async (name: string, svg: string) => void store.set(name, svg)
	})
}));

async function freshCache() {
	vi.resetModules();
	return import('$lib/draw/host/drawingCache');
}

describe('saved figure drawings', () => {
	it('shows a picture drawn in an earlier session', async () => {
		const first = await freshCache();
		first.saveDrawing('\\draw (0,0) -- (1,1);', '<svg><path d="M0 0"/></svg>');
		const name = first.drawingName('\\draw (0,0) -- (1,1);');
		for (let i = 0; i < 200 && !store.has(name); i++) await new Promise((r) => setTimeout(r, 5));

		const next = await freshCache();
		await next.loadSavedDrawing('\\draw (0,0) -- (1,1);');
		await next.loadSavedDrawing('\\draw (0,0) -- (2,2);');
		expect(next.cachedDrawing('\\draw (0,0) -- (1,1);')).toContain('<path');
		expect(next.cachedDrawing('\\draw (0,0) -- (2,2);')).toBeNull();
	});
});
