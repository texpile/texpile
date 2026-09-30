// @vitest-environment jsdom
//
// The wrapper every preview puts around its pages. What must hold: nothing is filtered while the
// document shows its own colors, a simulation points the filter at a definition in the SAME
// document (a popped-out preview has its own), and the notice that says so is on screen with the
// way back.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import ColorVisionFilter from '$lib/preview/colorVision/ColorVisionFilter.svelte';
import ColorVisionMenu from '$lib/preview/colorVision/ColorVisionMenu.svelte';
import { colorVision, feColorMatrixValues } from '$lib/preview/colorVision/colorVision';

let host: HTMLDivElement;
let app: Record<string, unknown> | null = null;

const page = createRawSnippet(() => ({ render: () => '<div class="page">page</div>' }));
const filtered = () => host.querySelector<HTMLElement>('[data-color-vision]')!;

beforeEach(() => {
	colorVision.current = 'none';
	host = document.createElement('div');
	document.body.appendChild(host);
});

afterEach(() => {
	if (app) unmount(app);
	app = null;
	host.remove();
	colorVision.current = 'none';
});

describe('ColorVisionFilter', () => {
	it('leaves the pages alone while nothing is simulated', () => {
		app = mount(ColorVisionFilter, { target: host, props: { class: 'h-full', children: page } });
		flushSync();
		expect(filtered().style.filter).toBe('');
		expect(host.querySelector('filter')).toBeNull();
		expect(host.querySelector('[role="status"]')).toBeNull();
		expect(host.querySelector('.page')).not.toBeNull();
	});

	it('filters the pages through a definition beside them and says so', () => {
		app = mount(ColorVisionFilter, { target: host, props: { children: page } });
		colorVision.current = 'deuteranopia';
		flushSync();
		const filter = host.querySelector('filter')!;
		// the serializer may quote the reference; what matters is that it names this filter
		expect(filtered().style.filter.replace(/"/g, '')).toBe(`url(#${filter.id})`);
		expect(filter.getAttribute('color-interpolation-filters')).toBe('linearRGB');
		expect(filter.querySelector('feColorMatrix')!.getAttribute('values')).toBe(feColorMatrixValues('deuteranopia'));
		// the notice sits outside the filtered box, so it is drawn in its true colors
		const notice = host.querySelector('[role="status"]')!;
		expect(filtered().contains(notice)).toBe(false);
		expect(notice.textContent).toContain('Deuteranopia');
	});

	it('goes back to true colors from the notice', () => {
		app = mount(ColorVisionFilter, { target: host, props: { children: page } });
		colorVision.current = 'achromatopsia';
		flushSync();
		host.querySelector<HTMLButtonElement>('[role="status"] button')!.click();
		flushSync();
		expect(colorVision.current).toBe('none');
		expect(filtered().style.filter).toBe('');
	});
});

describe('ColorVisionMenu', () => {
	it('picks a simulation from the toolbar and shows the button as on', () => {
		app = mount(ColorVisionMenu, { target: host, props: {} });
		flushSync();
		const button = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
		expect(button.getAttribute('aria-pressed')).toBe('false');
		button.click();
		flushSync();
		const items = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
		expect(items).toHaveLength(5);
		items.find((item) => item.textContent?.includes('Tritanopia'))!.click();
		flushSync();
		expect(colorVision.current).toBe('tritanopia');
		expect(host.querySelector('[role="menu"]')).toBeNull();
		expect(button.getAttribute('aria-pressed')).toBe('true');
	});
});
