import { describe, it, expect } from 'vitest';
import { FileOpener } from '$lib/workspace/fileOpener';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { VisualParser, type ParseOutcome } from '$lib/workspace/visualParse.svelte';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { standaloneText } from '$lib/buffers/documentText';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

function deferred() {
	let resolve!: (o: ParseOutcome) => void;
	const promise = new Promise<ParseOutcome>((r) => (resolve = r));
	return { promise, resolve };
}

describe('FileOpener with a collaborator typing', () => {
	it('parses again when the text changed while the open-time parse ran', async () => {
		const shared = standaloneText('');
		const doc = new DocumentBuffer({
			textModel: () => shared,
			writeNow: () => {},
			rebuildVisual: () => {},
			isVisualMode: () => true,
			noteLocalEdit: () => {},
			clearPendingAnchor: () => {}
		});
		const parser = new VisualParser(() => '');
		const parses: { text: string; done: ReturnType<typeof deferred> }[] = [];
		const opener = new FileOpener({
			doc,
			parser,
			readSource: async () => ({ text: shared.text.toString(), encoding: 'utf8' as const }),
			whenIdle: async () => {},
			isVisualMode: () => true,
			isSourceMode: () => false,
			isDiffMode: () => false,
			claimVisualLock: () => {},
			beforeOpen: async () => {},
			parse: (text) => {
				const done = deferred();
				parses.push({ text, done });
				return done.promise;
			},
			fallbackToSource: () => {},
			clearPerFileViewState: () => {},
			captureDiffSnapshot: () => {},
			closeOpenFile: () => {}
		});

		activeFilePath.current = 'new.tex';
		await opener.open('new.tex');
		expect(parses.map((p) => p.text)).toEqual(['']);

		const filled = '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n';
		shared.text.insert(0, filled);
		parses[0].done.resolve({ parsed: parseLatexFile('') });
		await Promise.resolve();
		await Promise.resolve();

		expect(parses.map((p) => p.text)).toEqual(['', filled]);
		parses[1].done.resolve({ parsed: parseLatexFile(filled) });
		await Promise.resolve();
		await Promise.resolve();
		expect(doc.visualDoc?.textContent).toContain('Hello');
	});
});
