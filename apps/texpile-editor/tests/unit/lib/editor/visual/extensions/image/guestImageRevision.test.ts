// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { imageNodeView } from '$lib/editor/visual/extensions/image/plugin/imageNodeView';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { fileService } from '$lib/files/service/fileService';
import { fileUriOf } from '$lib/files/identity/fileUris';
import type { FileChange } from '$lib/files/changes/fileChanges';
import type { WorkspaceProvider } from '$lib/workspace/workspaceProvider';
import type { ImagePluginSettings } from '$lib/editor/visual/extensions/image/types';
import type { EditorView } from 'prosemirror-view';

let off: (() => void) | null = null;
afterEach(() => off?.());

it("redraws a guest's picture when the host's file changes", async () => {
	let fire: (changes: FileChange[]) => void = () => {};
	off = fileService.use({ watch: (onChange: (c: FileChange[]) => void) => ((fire = onChange), () => {}) } as unknown as WorkspaceProvider);
	const urls = ['blob:http://x/first', 'blob:http://x/second'];
	const settings = {
		downloadImage: async () => urls[0],
		createOverlay: () => document.createElement('div'),
		updateOverlay: () => {},
		resizeCallback: () => () => {},
		deleteSrc: async () => {},
		enableResize: false,
		hasTitle: false
	} as unknown as ImagePluginSettings;
	const node = schema.nodes.image.create({ src: 'images/dot.png' });
	const view = imageNodeView(settings)(node, {} as EditorView, () => 0);
	const img = (view.dom as HTMLElement).querySelector('img')!;
	await new Promise((r) => setTimeout(r, 10));
	expect(img.src).toBe('blob:http://x/first');

	urls.shift();
	fire([{ type: 'updated', resource: fileUriOf('images/dot.png') }]);
	await new Promise((r) => setTimeout(r, 10));
	expect(img.src).toBe('blob:http://x/second');
	view.destroy?.();
});
