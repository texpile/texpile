import { describe, it, expect } from 'vitest';
import { FileOpener, type FileOpenerDeps } from '$lib/workspace/fileOpener';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import type { VisualParser } from '$lib/workspace/visualParse.svelte';

// regression: the open-time parse runs BEFORE doc.path switches, so the parse format MUST come
// from the path being opened, never from the still-open previous file's kind. The WorkspaceView
// adapter once re-derived it reactively, and opening a .tex while a .md was active parsed the
// .tex as markdown.
function makeOpener(parse: FileOpenerDeps['parse']) {
	const doc = new DocumentBuffer({
		scheduleSave: () => {},
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	const parser = {
		nextSequence: () => 1,
		isCurrent: () => true,
		lastParsedSource: null
	} as unknown as VisualParser;
	const opener = new FileOpener({
		doc,
		parser,
		readSource: async () => ({ text: 'contents', encoding: 'utf8' as const }),
		whenIdle: async () => {},
		isVisualMode: () => true,
		isSourceMode: () => false,
		isDiffMode: () => false,
		claimVisualLock: () => {},
		beforeOpen: async () => {},
		parse,
		fallbackToSource: () => {},
		clearPerFileViewState: () => {},
		captureDiffSnapshot: () => {},
		closeOpenFile: () => {}
	});
	return { opener, doc };
}

describe('FileOpener parse format', () => {
	it('derives the dialect from the OPENED path, not the previous buffer', async () => {
		const calls: Array<{ text: string; format: string }> = [];
		const { opener, doc } = makeOpener(async (text, format) => {
			calls.push({ text, format });
			return {};
		});

		// previous file is markdown...
		activeFilePath.current = 'C:/ws/notes.md';
		await opener.open('C:/ws/notes.md');
		expect(calls[0].format).toBe('md');
		expect(doc.kind).toBe('md');

		// ...and the incoming .tex must still parse as tex (doc.kind is 'md' until openTex runs)
		activeFilePath.current = 'C:/ws/paper.tex';
		await opener.open('C:/ws/paper.tex');
		expect(calls[1].format).toBe('tex');
		expect(doc.kind).toBe('tex');
		expect(activeFilePath.current).toBe('C:/ws/paper.tex');
	});
});
