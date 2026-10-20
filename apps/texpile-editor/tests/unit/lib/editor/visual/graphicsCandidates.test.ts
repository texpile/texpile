import { describe, expect, it } from 'vitest';
import { graphicCandidateUrls, graphicSearchDirs } from '$lib/editor/visual/graphicsCandidates';

describe('where a graphic is looked for', () => {
	it('adds the \\graphicspath folders to both the open file and the root, skipping a commented one', () => {
		const source = '% \\graphicspath{{old/}}\n\\graphicspath{{img/}{figs/}}';
		const dirs = graphicSearchDirs({ root: '/p', loadedPath: '/p/ch/a.tex', source });
		expect(dirs).toEqual(['/p/ch', '/p', '/p/ch/img/', '/p/img/', '/p/ch/figs/', '/p/figs/']);
	});

	it('tries the formats graphicx tries, in its order, that an image element shows', () => {
		const urls = graphicCandidateUrls('fig', { root: '/p', loadedPath: null, source: '', fileUrl: (p) => p });
		expect(urls.slice(0, 2)).toEqual(['/p/fig.png', '/p/fig.jpg']);
		expect(urls.some((u) => u.endsWith('.gif'))).toBe(false);
	});
});
