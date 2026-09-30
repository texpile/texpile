// One export, start to finish, with the platform dialog, the save and tinymist faked: what it asks,
// in which order, and what it reports.
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS } from '$lib/languages/typst/export/exportOptions';
import { runTypstExport, type ExportRunDeps } from '$lib/languages/typst/export/runTypstExport';
import type { TypstExportOptions } from '$lib/languages/typst/export/exportOptions.types';

function opts(patch: Partial<TypstExportOptions>): TypstExportOptions {
	return { ...DEFAULT_EXPORT_OPTIONS, ...patch };
}

function deps(patch: Partial<ExportRunDeps>): ExportRunDeps & { order: string[] } {
	const order: string[] = [];
	return {
		order,
		root: '/proj',
		main: '/proj/thesis.typ',
		lastDir: null,
		pick: vi.fn(async () => {
			order.push('pick');
			return '/out/thesis.pdf';
		}),
		serverReady: async () => true,
		flushSaves: async () => void order.push('save'),
		run: vi.fn(async (job) => {
			order.push('run');
			return { path: `${job.outputPath}.pdf`, data: null };
		}),
		...patch
	};
}

describe('runTypstExport', () => {
	it('asks for a file, saves, then exports there', async () => {
		const d = deps({});
		const outcome = await runTypstExport(opts({}), d);
		expect(d.pick).toHaveBeenCalledWith({ kind: 'file', defaultPath: '/proj/thesis.pdf', extension: 'pdf', title: 'Export PDF' });
		expect(d.run).toHaveBeenCalledWith({
			command: 'tinymist.exportPdf',
			arguments: ['/proj/thesis.typ', expect.any(Object)],
			outputPath: '/out/thesis'
		});
		expect(d.order).toEqual(['pick', 'save', 'run']);
		expect(outcome).toEqual({ kind: 'done', paths: ['/out/thesis.pdf'], dir: '/out' });
	});

	it('opens where the last export went', async () => {
		const d = deps({ lastDir: '/exports' });
		await runTypstExport(opts({ format: 'svg', merge: true }), d);
		expect(d.pick).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: '/exports/thesis.svg', extension: 'svg' }));
	});

	it('asks for a folder for one file per page, and reports that folder', async () => {
		const d = deps({
			pick: vi.fn(async () => '/out/pages'),
			run: vi.fn(async () => ({
				items: [
					{ page: 0, path: '/out/pages/thesis-1.png' },
					{ page: 1, path: '/out/pages/thesis-2.png' }
				],
				total_pages: 2
			}))
		});
		const outcome = await runTypstExport(opts({ format: 'png' }), d);
		expect(d.pick).toHaveBeenCalledWith({ kind: 'folder', defaultPath: '/proj', title: expect.any(String) });
		expect(d.run).toHaveBeenCalledWith(expect.objectContaining({ command: 'tinymist.exportPng', outputPath: '/out/pages/thesis-{0p}' }));
		expect(outcome).toEqual({ kind: 'done', paths: ['/out/pages/thesis-1.png', '/out/pages/thesis-2.png'], dir: '/out/pages' });
	});

	it('does nothing more when the dialog is cancelled', async () => {
		const d = deps({ pick: vi.fn(async () => null) });
		expect(await runTypstExport(opts({}), d)).toEqual({ kind: 'cancelled' });
		expect(d.run).not.toHaveBeenCalled();
	});

	it('says tinymist is missing before asking anything', async () => {
		const d = deps({ serverReady: async () => false });
		const outcome = await runTypstExport(opts({}), d);
		expect(outcome).toMatchObject({ kind: 'failed', missingTool: true });
		expect(d.pick).not.toHaveBeenCalled();
	});

	it("reports tinymist's failure in words", async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const d = deps({ run: vi.fn(async () => Promise.reject({ code: -32603, message: 'crates/x.rs:1:2: invalid ppi: 0' })) });
		expect(await runTypstExport(opts({}), d)).toEqual({ kind: 'failed', message: 'invalid ppi: 0' });
	});

	it('reports an export that wrote nothing', async () => {
		const d = deps({ pick: vi.fn(async () => '/out'), run: vi.fn(async () => ({ items: [], total_pages: 3 })) });
		expect(await runTypstExport(opts({ format: 'png', pages: '9-' }), d)).toMatchObject({ kind: 'failed' });
	});

	it('refuses a destination tinymist would rewrite, before saving or running', async () => {
		const d = deps({ pick: vi.fn(async () => '/out/$root/x.pdf') });
		expect(await runTypstExport(opts({}), d)).toMatchObject({ kind: 'failed' });
		expect(d.order).toEqual([]);
		expect(d.run).not.toHaveBeenCalled();
	});
});
