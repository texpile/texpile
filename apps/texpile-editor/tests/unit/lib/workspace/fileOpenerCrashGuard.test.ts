// @vitest-environment jsdom
// a file whose visual build killed the renderer last time opens in Source, with no parse
import { describe, it, expect, vi } from 'vitest';
import { FileOpener } from '$lib/workspace/fileOpener';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { noteVisualMount } from '$lib/workspace/visualMountGuard';
import type { VisualParser } from '$lib/workspace/visualParse.svelte';

describe('FileOpener after a visual build died', () => {
	it('drops to source mode instead of parsing the same file again', async () => {
		const parse = vi.fn(async () => ({}));
		const fallbackToSource = vi.fn();
		const doc = new DocumentBuffer({
			scheduleSave: () => {},
			writeNow: () => {},
			rebuildVisual: () => {},
			isVisualMode: () => true,
			noteLocalEdit: () => {},
			clearPendingAnchor: () => {}
		});
		const parser = { nextSequence: () => 1, isCurrent: () => true, lastParsedSource: null } as unknown as VisualParser;
		let visual = true;
		const opener = new FileOpener({
			doc,
			parser,
			readSource: async () => ({ text: 'contents', encoding: 'utf8' as const }),
			whenIdle: async () => {},
			isVisualMode: () => visual,
			isSourceMode: () => !visual,
			isDiffMode: () => false,
			claimVisualLock: () => {},
			beforeOpen: async () => {},
			parse,
			fallbackToSource: () => {
				visual = false;
				fallbackToSource();
			},
			clearPerFileViewState: () => {},
			captureDiffSnapshot: () => {},
			closeOpenFile: () => {}
		});
		noteVisualMount('C:/ws/huge.tex');
		activeFilePath.current = 'C:/ws/huge.tex';
		await opener.open('C:/ws/huge.tex');
		expect(fallbackToSource).toHaveBeenCalledTimes(1);
		expect(parse).not.toHaveBeenCalled();

		// once: the note is consumed, so the next open tries visual again
		visual = true;
		await opener.open('C:/ws/huge.tex');
		expect(fallbackToSource).toHaveBeenCalledTimes(1);
		expect(parse).toHaveBeenCalledTimes(1);
	});
});
