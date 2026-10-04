// The preview gives way to Version History's panel: shut, sliding, while the editor and the panel cannot keep
// their room beside it, back when the panel goes, and never brought back once the reader opened or shut it.
import { it, expect, vi, beforeEach } from 'vitest';

const saved = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], current: {} as Record<string, unknown> }));
vi.mock('$lib/storage/layout', () => ({
	layout: {
		get current() {
			return saved.current;
		}
	},
	updateLayout: (patch: Record<string, unknown>) => saved.calls.push(patch)
}));

const { PaneLayout } = await import('$lib/workspace/paneLayout.svelte');

function opened(windowWidth: number) {
	vi.stubGlobal('window', { innerWidth: windowWidth });
	const layout = new PaneLayout();
	layout.sidebarWidth = 256;
	layout.pdfPaneOpen = true;
	return layout;
}

beforeEach(() => {
	saved.calls = [];
});

it('shuts the preview, sliding and unsaved, when the panel leaves the editor too little room, and brings it back after', () => {
	const layout = opened(1100);
	layout.setEditorAside(256);
	expect(layout.pdfPaneOpen).toBe(false);
	expect(layout.pdfSlides).toBe(true);
	expect(saved.calls.some((c) => 'pdfPaneOpen' in c)).toBe(false);
	layout.setEditorAside(0);
	expect(layout.pdfPaneOpen).toBe(true);
});

it('leaves the preview open in a window with room for all of it', () => {
	const layout = opened(1600);
	layout.setEditorAside(256);
	expect(layout.pdfPaneOpen).toBe(true);
});

it('keeps the preview the reader opened again beside the panel, and jumps rather than slides', () => {
	const layout = opened(1100);
	layout.setEditorAside(256);
	layout.togglePdfPane();
	expect(layout.pdfPaneOpen).toBe(true);
	expect(layout.pdfSlides).toBe(false);
	layout.setEditorAside(0);
	expect(layout.pdfPaneOpen).toBe(true);
});

it('makes the room again when a session reopens on Version History with its preview saved open', () => {
	const layout = opened(1100);
	layout.pdfPaneOpen = false;
	layout.setEditorAside(256);
	saved.current = { pdfPaneOpen: true, sidebarOpen: true, sidebarWidth: 256, pdfPaneFraction: 0.4 };
	layout.restore();
	expect(layout.pdfPaneOpen).toBe(false);
});
