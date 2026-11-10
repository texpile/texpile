import { expect, it, vi } from 'vitest';
import { URI } from 'vscode-uri';

const files = vi.hoisted(() => ({
	changes: [] as ((e: unknown) => void)[],
	readText: vi.fn(async (path: string) => `text of ${path}`)
}));
vi.mock('$lib/files/service/fileService', () => ({
	fileService: {
		onDidFilesChange: (fn: (e: unknown) => void) => (files.changes.push(fn), () => {}),
		onDidRunOperation: () => () => {},
		readText: files.readText
	}
}));
vi.mock('$lib/buffers/textNow', () => ({ textNow: files.readText }));

import { watchDraftInputs } from '$lib/draft/draftInputWatch';

// an agent writing a chapter the open file \inputs left the preview on the old text
it('sends a changed file the document reads, other than the open one, and rebuilds for a bibliography', async () => {
	const edit = vi.fn();
	const rebuild = vi.fn();
	watchDraftInputs({ root: () => '/proj', loadedPath: () => '/proj/main.tex', isActive: () => true, edit, rebuild });
	const updated = ['/proj/chap.tex', '/proj/main.tex', '/proj/_draft/draft.tex', '/elsewhere/x.tex', '/proj/refs.bib'];
	files.changes[0]({ rawUpdated: updated.map((p) => URI.file(p)), rawAdded: [] });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(edit.mock.calls.map(([path]) => path.replace(/\\/g, '/'))).toEqual(['/proj/chap.tex']);
	expect(rebuild).toHaveBeenCalledTimes(1);
});
