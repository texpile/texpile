import { expect, it } from 'vitest';
import { closeFigure, figureTabLabel, publishFigure } from '$lib/draw/host/anchor/openFigures.svelte';

it('a figure tab behind another keeps its number', () => {
	publishFigure('f1', { path: '/p/main.tex', number: 2, picture: { from: 0, to: 9 }, selected: [] });
	closeFigure('f1');
	expect(figureTabLabel('f1', 'main.tex')).toBe('Figure 2 - main.tex');
	publishFigure('f1', { path: '/p/main.tex', number: null, picture: null, selected: [] });
	expect(figureTabLabel('f1', 'main.tex')).toBe('Figure - main.tex');
});
