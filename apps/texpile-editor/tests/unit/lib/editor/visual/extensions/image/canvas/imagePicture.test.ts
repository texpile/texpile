// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { forgetPictures, pictureFor } from '$lib/editor/visual/extensions/image/canvas/imagePicture';
import { createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const decode = HTMLImageElement.prototype.decode;
beforeEach(() => {
	HTMLImageElement.prototype.decode = async () => {};
	Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 40 });
	Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 20 });
});
afterEach(() => {
	HTMLImageElement.prototype.decode = decode;
	delete (HTMLImageElement.prototype as { naturalWidth?: number }).naturalWidth;
	delete (HTMLImageElement.prototype as { naturalHeight?: number }).naturalHeight;
});

const settle = () => new Promise((done) => setTimeout(done, 0));

it('a rewritten file shows its old picture until the new one is in, read past the cache', async () => {
	const url = 'texfile://paper/figs/drawn.png';
	const settings = { ...createLocalImageSettings(() => '/paper'), downloadImage: async () => url };
	const node = schema.nodes.image.create({ src: 'figs/drawn.png' }, schema.text('A plot.'));
	expect(pictureFor(window, settings, node).state).toBe('loading');
	await settle();
	const first = pictureFor(window, settings, node);
	expect(first.state === 'ready' && first.image.src).toBe(url);
	forgetPictures(window, (shown) => shown === url);
	expect(pictureFor(window, settings, node)).toBe(first);
	await settle();
	const second = pictureFor(window, settings, node);
	expect(second.state === 'ready' && second.image.src).toBe(`${url}?_=1`);
});

it('a missing picture is looked for again', async () => {
	let found = '';
	const settings = { ...createLocalImageSettings(() => '/paper'), downloadImage: async () => found };
	const node = schema.nodes.image.create({ src: 'figs/later.png' }, schema.text('Later.'));
	pictureFor(window, settings, node);
	await settle();
	expect(pictureFor(window, settings, node).state).toBe('missing');
	found = 'texfile://paper/figs/later.png';
	forgetPictures(window, () => false);
	expect(pictureFor(window, settings, node).state).toBe('loading');
	await settle();
	expect(pictureFor(window, settings, node).state).toBe('ready');
});
