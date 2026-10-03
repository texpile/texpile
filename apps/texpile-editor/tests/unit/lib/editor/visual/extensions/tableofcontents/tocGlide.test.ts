// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorView as CMView } from '@codemirror/view';
import { glideSourceTo } from '$lib/editor/visual/extensions/tableofcontents/tocGlide';

// jsdom lays nothing out: a scroller 2000px tall in a 500px window, which clamps a scroll as a browser does
function scroller(scrollTop: number): HTMLElement {
	const el = document.createElement('div');
	let top = scrollTop;
	Object.defineProperties(el, {
		scrollHeight: { value: 2000 },
		clientHeight: { value: 500 },
		scrollTop: { get: () => top, set: (v: number) => (top = Math.max(0, Math.min(v, 1500))) }
	});
	el.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
		if (typeof opts === 'object' && opts.top !== undefined) el.scrollTop = opts.top;
	}) as typeof el.scrollTo;
	return el;
}

// the document's top on screen moves up as the scroller scrolls down
function sourceView(el: HTMLElement, lineTop: number): CMView {
	return {
		scrollDOM: el,
		get documentTop() {
			return -el.scrollTop;
		},
		lineBlockAt: () => ({ top: lineTop })
	} as unknown as CMView;
}

beforeEach(() => {
	vi.stubGlobal('matchMedia', () => ({ matches: false }));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Contents glide', () => {
	// no scroll happens, so no scrollend ends the glide, and the next scroll from elsewhere was pulled back
	it('leaves a later scroll alone after a heading the scroller cannot bring any higher', () => {
		const el = scroller(1500);
		glideSourceTo(sourceView(el, 1900), 1);
		el.scrollTop = 300;
		el.dispatchEvent(new Event('scrollend'));
		expect(el.scrollTop).toBe(300);
	});

	it('leaves a later scroll alone after the first heading, glided to from the top', () => {
		const el = scroller(0);
		glideSourceTo(sourceView(el, 4), 1);
		el.scrollTop = 300;
		el.dispatchEvent(new Event('scrollend'));
		expect(el.scrollTop).toBe(300);
	});
});
