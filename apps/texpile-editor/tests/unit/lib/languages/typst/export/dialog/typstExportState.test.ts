import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const run = vi.hoisted(() => ({ order: [] as string[], picked: null as string | null }));
vi.mock('$lib/languages/typst/export/exportTarget', () => ({
	exportTargetAvailable: () => true,
	pickExportTarget: async () => {
		run.order.push('pick');
		return run.picked;
	}
}));
vi.mock('$lib/languages/typst/export/exportRequest', () => ({
	requestTypstExport: vi.fn(async (_root: string, job: { outputPath: string }) => {
		run.order.push('export');
		return { path: `${job.outputPath}.pdf` };
	})
}));
vi.mock('$lib/languages/typst/intellisense/lspClient', () => ({
	tinymistResolved: async () => true,
	typstBridgeAvailable: () => true,
	typstServerGen: { current: 0 }
}));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success: vi.fn(), error: vi.fn() } }));

import { typstExport } from '$lib/languages/typst/export/dialog/typstExportState.svelte';
import { requestTypstExport } from '$lib/languages/typst/export/exportRequest';
import { mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';

beforeEach(() => {
	run.order = [];
	workspaceRoot.current = '/proj';
	mainFile.current = '/proj/thesis.typ';
	typstExport.connect({ flushSaves: async () => void run.order.push('save'), refreshTree: () => {} });
});

afterEach(() => {
	typstExport.connect(null);
	workspaceRoot.current = null;
	mainFile.current = null;
});

// a PDF went into output/ before the save dialog asked, so even a cancel left one in the project
it('writes nothing when the save dialog is cancelled', async () => {
	run.picked = null;
	await typstExport.run();
	expect(run.order).toEqual(['pick']);
});

it('has tinymist write the PDF straight to the picked file', async () => {
	run.picked = '/out/thesis.pdf';
	await typstExport.run();
	expect(run.order).toEqual(['pick', 'save', 'export']);
	expect(requestTypstExport).toHaveBeenCalledWith(
		'/proj',
		expect.objectContaining({ command: 'tinymist.exportPdf', outputPath: '/out/thesis' }),
		expect.any(Number)
	);
});
