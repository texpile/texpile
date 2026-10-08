// A file holding places a merge marked is shown in the source editor, whatever view the author
// chose: the visual editor would parse <<<<<<< and ======= into stray paragraphs, and a visual edit
// would then write those back as the author's text. It stays there until every place is chosen and
// the author asks for the visual editor, which then parses what the choices left.
import { describe, it, expect, vi } from 'vitest';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import { emptyMap } from '$lib/editor/visual/sourceSpans';

const MARKED = 'Intro.\n<<<<<<< HEAD\nMine.\n=======\nTheirs.\n>>>>>>> origin/main\n';

function setup() {
	const rebuildVisual = vi.fn();
	const doc = new DocumentBuffer({
		scheduleSave: () => {},
		writeNow: () => {},
		rebuildVisual,
		isVisualMode: () => modes.mode === 'visual',
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	const modes: ViewModeSwitch = new ViewModeSwitch({
		getKind: () => doc.kind,
		getLoadedPath: () => doc.path,
		getSource: () => doc.texSource,
		getDocMeta: () => doc.docMeta,
		getMountedSource: () => doc.lastDocSource,
		getSourceMap: () => emptyMap(),
		getEncodingIssue: () => doc.encodingIssue,
		getConflicted: () => doc.conflicted,
		leaveConflicts: () => doc.leaveConflicts(),
		rebuildVisual,
		startCompare: () => {},
		captureDiffSnapshot: () => {}
	});
	return { doc, modes, rebuildVisual };
}

describe('a file that came in with marked places', () => {
	it('is flagged on open and counts what is left to choose', () => {
		const { doc } = setup();
		doc.openTex('C:/ws/main.tex', MARKED, '\n');
		expect(doc.conflicted).toBe(true);
		expect(doc.conflictsLeft).toBe(1);

		doc.onTexInput('Intro.\nMine.\n');
		expect(doc.conflictsLeft).toBe(0);
		// still flagged: the pane does not flip to the visual editor under the author's last click
		expect(doc.conflicted).toBe(true);
	});

	it('is not flagged for an ordinary file, or once another file opens', () => {
		const { doc } = setup();
		doc.openTex('C:/ws/main.tex', 'Just text.\n=======\n', '\n');
		expect(doc.conflicted).toBe(false);
		doc.openTex('C:/ws/a.tex', MARKED, '\n');
		doc.openTex('C:/ws/b.tex', 'Clean.\n', '\n');
		expect(doc.conflicted).toBe(false);
		doc.openRaw('C:/ws/refs.bib', MARKED, '\n');
		expect(doc.conflicted).toBe(true);
		doc.close();
		expect(doc.conflicted).toBe(false);
	});

	it('is flagged when a merge rewrites the file while it is open', () => {
		const { doc } = setup();
		doc.openTex('C:/ws/main.tex', 'Intro.\n', '\n');
		doc.replaceSource(MARKED, { dirty: false });
		expect(doc.conflicted).toBe(true);
	});

	it('keeps the visual editor away while a place is left, and hands the file back after', () => {
		const { doc, modes, rebuildVisual } = setup();
		modes.mode = 'source';
		doc.openTex('C:/ws/main.tex', MARKED, '\n');

		modes.set('visual');
		expect(modes.mode).toBe('source');
		expect(rebuildVisual).not.toHaveBeenCalled();

		doc.onTexInput('Intro.\nTheirs.\n');
		modes.set('visual');
		expect(modes.mode).toBe('visual');
		expect(doc.conflicted).toBe(false);
		expect(rebuildVisual).toHaveBeenCalledTimes(1);
	});

	it('parses the chosen text when the author had the visual editor all along', () => {
		const { doc, modes, rebuildVisual } = setup();
		expect(modes.mode).toBe('visual');
		doc.openTex('C:/ws/main.tex', MARKED, '\n');
		doc.onTexInput('Intro.\nMine.\n');
		rebuildVisual.mockClear();

		// the pane showed the source editor under a 'visual' mode; asking for visual again is how it ends
		modes.set('visual');
		expect(doc.conflicted).toBe(false);
		expect(rebuildVisual).toHaveBeenCalledTimes(1);
	});
});

// settled by hand with one marker line missed: Complete Merge refuses the file, so the editor must not
// call it done, nor offer the visual editor, where the line would print as a paragraph
describe('a marker line left behind', () => {
	const LEFT = 'Intro.\nMine.\n=======\nOutro.\n';

	it('keeps the file in merge mode while git still counts it as unmerged', async () => {
		const { gitChanges } = await import('$lib/workspace/scm/gitStore');
		const { doc } = setup();
		gitChanges.current = [{ path: '/p/a.tex', x: 'U', y: 'U' } as (typeof gitChanges.current)[number]];
		doc.openTex('/p/a.tex', LEFT, '\n');
		expect(doc.conflicted).toBe(true);
		expect(doc.conflictsLeft).toBe(0);
		expect(doc.strayMarkers).toBe(true);
		expect(doc.leaveConflicts()).toBe(false);
		// not being merged: a line of seven = is the author's text
		gitChanges.current = [];
		doc.openTex('/p/a.tex', LEFT, '\n');
		expect(doc.conflicted).toBe(false);
	});

	// a Markdown heading underlined with seven =, still on screen when Finish combining saves the merge
	it('lets the file go once git no longer counts it as unmerged', async () => {
		const { gitChanges } = await import('$lib/workspace/scm/gitStore');
		const { doc } = setup();
		gitChanges.current = [{ path: '/p/paper.md', x: 'U', y: 'U' } as (typeof gitChanges.current)[number]];
		doc.openTex('/p/paper.md', 'Methods\n=======\n\nMy result, and theirs.\n', '\n');
		expect(doc.strayMarkers).toBe(true);
		gitChanges.current = [];
		expect(doc.strayMarkers).toBe(false);
		expect(doc.leaveConflicts()).toBe(true);
	});
});
