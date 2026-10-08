// The preview split in two: each renderer a view of its own, jumps and shortcuts on the one in use
import { describe, expect, it } from 'vitest';
import { PdfViews } from '$lib/pdf-view/pdfViews.svelte';
import type { PdfViewerActions } from '$lib/pdf-view';
import { previewViewOf } from '$lib/workspace/groups/layouts';

const actionsAt = (page: number) => ({ goToPage: () => page }) as unknown as PdfViewerActions;

describe('PdfViews', () => {
	it('keeps the toolbar on the first view until another is pressed, and falls back when the pressed one goes', () => {
		const views = new PdfViews(1, true);
		const top = views.attach();
		top.register(actionsAt(1));
		top.state.scale = 1.4;
		const bottom = views.attach();
		bottom.register(actionsAt(2));
		// the new view opens at the zoom of the one in use
		expect(bottom.state.scale).toBe(1.4);
		expect(views.actions()?.goToPage(0)).toBe(1);
		bottom.activate();
		expect(views.actions()?.goToPage(0)).toBe(2);
		bottom.detach();
		expect(views.list).toHaveLength(1);
		expect(views.actions()?.goToPage(0)).toBe(1);
	});

	it('reads as the active view, and as an idle one that can save before any renderer mounts', () => {
		const views = new PdfViews(1, true);
		expect(views.state).toMatchObject({ loading: true, canSavePdf: true });
		views.attach();
		const bottom = views.attach();
		bottom.state.currentPage = 3;
		bottom.activate();
		expect(views.state.currentPage).toBe(3);
	});

	// a sync from the bottom editor lands in the bottom view, and the toolbar goes with it
	it('jumps in the view level with the editor that asked, and makes it the one in use', () => {
		const views = new PdfViews(1, true);
		views.attach().register(actionsAt(1));
		views.attach().register(actionsAt(2));
		expect(views.jumpIn(previewViewOf('rows', 1))?.goToPage(0)).toBe(2);
		expect(views.actions()?.goToPage(0)).toBe(2);
		// grid: the bottom left slot is on the bottom row; two side by side: the left one goes to the top
		expect(previewViewOf('grid', 2)).toBe(1);
		expect(views.jumpIn(previewViewOf('columns', 0))?.goToPage(0)).toBe(1);
		// one editor: the view in use
		expect(views.jumpIn(previewViewOf('one', 0))?.goToPage(0)).toBe(1);
	});
});
