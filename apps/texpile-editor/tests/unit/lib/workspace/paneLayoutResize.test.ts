import { it, expect, vi } from 'vitest';

vi.mock('$lib/storage/layout', () => ({
	layout: { current: { pdfPaneOpen: true, sidebarOpen: true, sidebarWidth: 256, pdfPaneFraction: 0.4 } },
	updateLayout: () => {}
}));

const { PaneLayout } = await import('$lib/workspace/paneLayout.svelte');

it('keeps the preview at its share of the window when the window grows', () => {
	vi.stubGlobal('window', { innerWidth: 1200 });
	const layout = new PaneLayout();
	layout.restore();
	expect(layout.pdfPaneWidth).toBe(480);
	vi.stubGlobal('window', { innerWidth: 1920 });
	layout.reclampPdf();
	expect(layout.pdfPaneWidth).toBe(768);
});
