// @vitest-environment jsdom
// A hover or completion doc is Markdown from the language server, which a guest's session relays from the host,
// and Markdown carries raw HTML
import { it, expect } from 'vitest';
import { sanitizeDocHtml } from '$lib/languages/typst/intellisense/lspDocHtml';

it('keeps the markup Markdown renders to and the highlighted code in it', () => {
	const html = '<p>A <a href="https://typst.app/docs">link</a></p><pre><code><span class="ͼd">let</span> x</code></pre>';
	expect(sanitizeDocHtml(html)).toBe(html);
});

it('drops what a doc comment could add of its own: handlers, frames, script links, the app styling classes', () => {
	expect(sanitizeDocHtml('<p>x<img src="x" onerror="alert(1)"></p>')).toBe('<p>x</p>');
	expect(sanitizeDocHtml('<iframe src="http://127.0.0.1:7317/"></iframe><a href="javascript:alert(1)">y</a>')).toBe('<a>y</a>');
	expect(sanitizeDocHtml('<span class="fixed inset-0 z-50" style="color:red">z</span>')).toBe('<span>z</span>');
});
