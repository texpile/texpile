// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { pictureFor } from '$lib/editor/visual/extensions/image/canvas/imagePicture';
import { watchPictureFiles } from '$lib/editor/visual/extensions/image/canvas/pictureFileWatch';
import { createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { fileService } from '$lib/files/service/fileService';
import { fileUriOf } from '$lib/files/identity/fileUris';
import type { FileChange } from '$lib/files/changes/fileChanges';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const decode = HTMLImageElement.prototype.decode;
let off: (() => void) | null = null;
beforeEach(() => {
	HTMLImageElement.prototype.decode = async () => {};
	Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 40 });
});
afterEach(() => {
	HTMLImageElement.prototype.decode = decode;
	delete (HTMLImageElement.prototype as { naturalWidth?: number }).naturalWidth;
	off?.();
});

const settle = () => new Promise((done) => setTimeout(done, 0));

it("redraws a guest's picture when the host's file changes", async () => {
	let fire: (changes: FileChange[]) => void = () => {};
	off = fileService.use({ watch: (onChange: (c: FileChange[]) => void) => ((fire = onChange), () => {}) } as unknown as WorkspaceProvider);
	const urls = ['blob:http://x/first', 'blob:http://x/second'];
	const settings = { ...createLocalImageSettings(() => '/paper'), downloadImage: async () => urls[0] };
	const node = schema.nodes.image.create({ src: 'images/dot.png' }, schema.text('A dot.'));
	watchPictureFiles(window);
	pictureFor(window, settings, node);
	await settle();
	const first = pictureFor(window, settings, node);
	expect(first.state === 'ready' && first.image.src).toBe('blob:http://x/first');

	urls.shift();
	fire([{ type: 'updated', resource: fileUriOf('images/dot.png') }]);
	await settle();
	const second = pictureFor(window, settings, node);
	expect(second.state === 'ready' && second.image.src).toBe('blob:http://x/second');
});
