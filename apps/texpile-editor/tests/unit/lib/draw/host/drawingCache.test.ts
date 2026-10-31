import { describe, expect, it, vi } from 'vitest';

const disk = new Map<string, string>();
vi.mock('$lib/files/service/fileService', () => ({
	fileService: {
		exists: async (p: string) => disk.has(p),
		readText: async (p: string) => disk.get(p) ?? '',
		writeText: async (p: string, t: string) => void disk.set(p, t),
		remove: async (p: string) => void disk.delete(p)
	}
}));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: '/paper' } }));

async function freshCache() {
	vi.resetModules();
	return import('$lib/draw/host/drawingCache');
}

// the writes queue behind each other: done once the index ends with the last one
async function written(last: string): Promise<void> {
	const kept = () => JSON.parse(disk.get('/paper/.texpile/figures/index.json') ?? '[]') as string[];
	for (let i = 0; i < 1000 && kept().at(-1) !== last; i++) await new Promise((r) => setTimeout(r, 5));
}

describe('saved figure drawings', () => {
	it('shows a picture drawn in an earlier session, and keeps only the most recent', async () => {
		const first = await freshCache();
		for (let i = 0; i <= 200; i++) first.saveDrawing(`\\draw (0,0) -- (${i},1);`, `<svg>${i}</svg>`);
		await written(first.drawingName('\\draw (0,0) -- (200,1);'));

		const next = await freshCache();
		await next.loadSavedDrawing('\\draw (0,0) -- (200,1);');
		expect(next.cachedDrawing('\\draw (0,0) -- (200,1);')).toBe('<svg>200</svg>');
		await next.loadSavedDrawing('\\draw (0,0) -- (0,1);');
		expect(next.cachedDrawing('\\draw (0,0) -- (0,1);')).toBeNull();
		expect([...disk.keys()].filter((k) => k.endsWith('.svg'))).toHaveLength(200);
	});
});
