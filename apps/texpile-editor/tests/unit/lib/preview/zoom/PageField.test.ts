// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PageField from '$lib/preview/zoom/PageField.svelte';

let app: Record<string, unknown> | null = null;

afterEach(() => {
	if (app) void unmount(app);
	app = null;
	document.body.replaceChildren();
});

describe('the page field', () => {
	it('goes to a page in range, and takes back one out of range', () => {
		const went: number[] = [];
		app = mount(PageField, { target: document.body, props: { page: 2, total: 3, label: 'Page', ongo: (page: number) => went.push(page) } });
		flushSync();
		const input = document.querySelector('input')!;

		input.value = '3';
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(went).toEqual([3]);

		input.value = '9';
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(went).toEqual([3]);
		expect(input.value).toBe('2');
	});
});
