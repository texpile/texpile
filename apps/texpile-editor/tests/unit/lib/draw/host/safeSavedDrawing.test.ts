// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { safeSavedDrawing } from '$lib/draw/host/safeSavedDrawing';

describe('safeSavedDrawing', () => {
	it('keeps what the figure tab writes', () => {
		const svg =
			'<svg xmlns="http://www.w3.org/2000/svg" width="10pt" height="10pt" viewBox="0 0 10 10"><defs><clipPath id="c1"><path d="M0 0"/></clipPath></defs>' +
			'<g transform="scale(1 -1)" style="isolation:isolate"><path d="M0 0L1 1" fill="none" stroke="rgb(0 0 0)" clip-path="url(#c1)" style="mix-blend-mode:multiply"/></g></svg>';
		expect(safeSavedDrawing(svg)).toBe(svg);
	});

	it('takes out what a shared folder could add', () => {
		const out = safeSavedDrawing(
			'<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><style>body{display:none}</style><script>x()</script>' +
				'<foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="https://example.test"/></foreignObject>' +
				'<g style="position:fixed"><image href="https://example.test/a.png" onerror="x()"/></g></svg>'
		)!;
		expect(out).not.toMatch(/onload|onerror|style>|script|foreignObject|iframe|position|example\.test/);
	});

	it('refuses a file that is no drawing', () => {
		expect(safeSavedDrawing('<html></html>')).toBeNull();
	});
});
