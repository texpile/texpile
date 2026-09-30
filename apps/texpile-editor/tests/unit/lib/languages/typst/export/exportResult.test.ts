// tinymist's answers, as they came back from a real tinymist 0.15 LSP session, and what the dialog
// makes of them.
import { describe, expect, it } from 'vitest';
import { exportErrorText, writtenPaths } from '$lib/languages/typst/export/exportResult';

describe('written paths', () => {
	it('reads a single file', () => {
		expect(writtenPaths({ data: null, path: '/out/a/doc.pdf' })).toEqual(['/out/a/doc.pdf']);
	});

	it('reads pages in order', () => {
		const res = {
			items: [
				{ data: null, page: 1, path: '/out/doc-2.png' },
				{ data: null, page: 2, path: '/out/doc-3.png' }
			],
			total_pages: 3
		};
		expect(writtenPaths(res)).toEqual(['/out/doc-2.png', '/out/doc-3.png']);
	});

	it('reads nothing from a range past the last page, or from no answer', () => {
		expect(writtenPaths({ items: [], total_pages: 3 })).toEqual([]);
		expect(writtenPaths(null)).toEqual([]);
		expect(writtenPaths({ path: null, data: 'JVBERi0x' })).toEqual([]);
	});
});

describe('error text', () => {
	it('turns a standard the document breaks into its message and hint', () => {
		const err = {
			code: -32603,
			message:
				'[SourceDiagnostic { severity: Error, span: DiagSpan { span: Span(1), extra: 0 }, message: "PDF/UA-1 error: missing document title", trace: [], hints: ["set the title with `set document(title: [...])`"] }]'
		};
		expect(exportErrorText(err)).toBe('PDF/UA-1 error: missing document title\n  set the title with `set document(title: [...])`');
	});

	it('shows the compiler error of a document that does not compile, with its source excerpt', () => {
		const err = {
			code: -32603,
			message:
				'crates/tinymist/src/task/export.rs:606:17: ExportTask(1): document is not available for export: "error: unknown variable: html\\n  ┌─ /p/main.typ:4:1\\n  │\\n4 │ #html.elem(\\"div\\")\\n  │  ^^^^\\n\\n"'
		};
		expect(exportErrorText(err)).toBe('error: unknown variable: html\n  ┌─ /p/main.typ:4:1\n  │\n4 │ #html.elem("div")\n  │  ^^^^');
	});

	it('drops the source location tinymist puts in front of its own errors', () => {
		expect(exportErrorText({ code: -32603, message: 'crates/tinymist-task/src/compute/png.rs:29:13: invalid ppi: 0' })).toBe(
			'invalid ppi: 0'
		);
		expect(exportErrorText({ code: -32603, message: ': invalid fill (invalid color: rgb(1,2,3))' })).toBe(
			'invalid fill (invalid color: rgb(1,2,3))'
		);
		expect(
			exportErrorText({
				code: -32603,
				message:
					'prepare pdf standards: PDF/A-4 and PDF/UA-1 are mutually incompatible because they do not have any overlapping PDF versions'
			})
		).toBe('prepare pdf standards: PDF/A-4 and PDF/UA-1 are mutually incompatible because they do not have any overlapping PDF versions');
	});

	it('passes a plain Error through', () => {
		expect(exportErrorText(new Error('Request timed out'))).toBe('Request timed out');
	});
});
