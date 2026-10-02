// @vitest-environment jsdom
// replace across files in a closed file: comments stay on their words, suggestion mode suggests
import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk: Record<string, string> = {};
vi.mock('$lib/workspace/fileSystem', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/fileSystem')>()),
	readTextFile: async (p: string) => {
		if (!(p in disk)) throw new Error(`ENOENT ${p}`);
		return disk[p];
	},
	writeTextFile: async (p: string, text: string) => void (disk[p] = text)
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
vi.mock('$lib/comments/author', () => ({ resolveAuthor: async () => 'louis', forgetAuthor: () => {} }));

const { CommentsController } = await import('$lib/workspace/commentsController.svelte');
const { carryClosedEdit } = await import('$lib/workspace/edits/closedFileEdit');
import { buildAnchor, resolveAnchor } from '$lib/comments/anchor';
import { openEvent, serializeLog } from '$lib/comments/log';
import { isOpenSuggestion } from '$lib/comments/suggest';
import { replaceInFiles, type ReplaceDeps, type ReplaceSpec } from '$lib/search/replaceInFiles';

const ROOT = '/w';
const CHAPTER = '/w/chapters/model.tex';
const TEXT = 'We apply a softmax over all of the positions.\nThe softmax is smooth.\n';
const SPEC: ReplaceSpec = { query: 'softmax', replacement: 'sigmoid', regex: false, caseSensitive: false };

let mode: 'editing' | 'suggesting' = 'editing';

async function setUp() {
	for (const k of Object.keys(disk)) delete disk[k];
	disk[CHAPTER] = TEXT;
	disk['/w/main.tex'] = '\\input{chapters/model}';
	// a comment across the start of a match: the words it sits on change under it
	const from = TEXT.indexOf('softmax over');
	disk[`${ROOT}/.texpile/comments.jsonl`] = serializeLog([
		openEvent({
			id: 'c1',
			file: 'chapters/model.tex',
			by: 'mei',
			body: 'Say which axis.',
			anchor: buildAnchor(TEXT, from, from + 'softmax over all'.length),
			at: '2026-09-01T00:00:00Z'
		})
	]);
	const ctl = new CommentsController({
		root: () => ROOT,
		preferredAuthor: () => '',
		openFileAt: () => {},
		activeText: () => disk['/w/main.tex'],
		mode: () => mode,
		applyEdit: async () => false,
		saveNow: () => {}
	});
	await ctl.load(ROOT);
	ctl.reanchor('/w/main.tex', disk['/w/main.tex']);
	const deps: ReplaceDeps = {
		open: () => null,
		applyToOpen: async () => false,
		flush: async () => {},
		read: async (p) => ({ text: disk[p], encoding: 'utf8' }),
		write: async (p, text) => void (disk[p] = text),
		encodingError: () => null,
		changed: () => {},
		edited: (path, before, after, edits, made) => carryClosedEdit(ctl, ROOT, made ?? mode, { path, before, after, edits })
	};
	return { ctl, deps };
}

const comment = (ctl: InstanceType<typeof CommentsController>) => ctl.threads.find((t) => t.id === 'c1')!;

beforeEach(() => {
	mode = 'editing';
});

describe('replace across files, in a file that is not open', () => {
	it('keeps a comment on the words it rewrote, where the old anchor would have come loose', async () => {
		const { ctl, deps } = await setUp();
		const old = comment(ctl).anchor;
		await replaceInFiles([CHAPTER], SPEC, deps);

		expect(disk[CHAPTER]).toBe('We apply a sigmoid over all of the positions.\nThe sigmoid is smooth.\n');
		// the old anchor would have come loose
		expect(resolveAnchor(disk[CHAPTER], old)).toBeNull();
		const moved = comment(ctl).anchor;
		expect(moved.quote).toBe('sigmoid over all');
		expect(resolveAnchor(disk[CHAPTER], moved)).toMatchObject({ exact: true });
		// persisted for the next time the folder opens
		expect(disk[`${ROOT}/.texpile/comments.jsonl`]).toContain('"t":"anchor"');
	});

	it('puts the comment back on its words when the replace is undone', async () => {
		const { ctl, deps } = await setUp();
		const out = await replaceInFiles([CHAPTER], SPEC, deps);
		await out.undo!();
		expect(disk[CHAPTER]).toBe(TEXT);
		expect(comment(ctl).anchor.quote).toBe('softmax over all');
		expect(resolveAnchor(TEXT, comment(ctl).anchor)).toMatchObject({ exact: true });
	});

	it('in suggestion mode, makes each change a suggestion, as the open file does', async () => {
		mode = 'suggesting';
		const { ctl, deps } = await setUp();
		await replaceInFiles([CHAPTER], SPEC, deps);

		const suggestions = ctl.threads.filter((t) => t.file === 'chapters/model.tex' && isOpenSuggestion(t));
		expect(suggestions.map((t) => [t.anchor.quote, t.restore])).toEqual([
			['sigmoid', 'softmax'],
			['sigmoid', 'softmax']
		]);
		expect(suggestions.every((t) => resolveAnchor(disk[CHAPTER], t.anchor))).toBe(true);
		expect(comment(ctl).anchor.quote).toBe('sigmoid over all');
	});

	it('leaves a comment on words no match touches as it was', async () => {
		const { ctl, deps } = await setUp();
		await replaceInFiles([CHAPTER], { ...SPEC, query: 'smooth', replacement: 'differentiable' }, deps);
		expect(comment(ctl).anchor.quote).toBe('softmax over all');
		expect(disk[`${ROOT}/.texpile/comments.jsonl`]).not.toContain('"t":"anchor"');
	});

	it('in suggestion mode, leaves no thread behind when the replace is undone', async () => {
		mode = 'suggesting';
		const { ctl, deps } = await setUp();
		const out = await replaceInFiles([CHAPTER], SPEC, deps);
		await out.undo!();
		expect(ctl.threads.filter((t) => t.restore !== undefined).map((t) => t.decision)).toEqual([]);
	});

	it('undoes and redoes a replace the way it was made, whichever mode the reader is in by then', async () => {
		mode = 'suggesting';
		const { ctl, deps } = await setUp();
		const out = await replaceInFiles([CHAPTER], SPEC, deps);
		const suggestions = () => ctl.threads.filter((t) => t.restore !== undefined);
		mode = 'editing';
		await out.undo!();
		expect(suggestions()).toEqual([]);
		await out.redo!();
		expect(suggestions().map((t) => [t.anchor.quote, t.restore, t.resolved])).toEqual([
			['sigmoid', 'softmax', false],
			['sigmoid', 'softmax', false]
		]);
	});

	it('in suggestion mode, takes the suggestions away again when the replace is undone, and redoes them', async () => {
		mode = 'suggesting';
		const { ctl, deps } = await setUp();
		const out = await replaceInFiles([CHAPTER], SPEC, deps);
		const open = () => ctl.threads.filter((t) => t.file === 'chapters/model.tex' && isOpenSuggestion(t)).map((t) => t.anchor.quote);
		await out.undo!();
		expect(disk[CHAPTER]).toBe(TEXT);
		expect(open()).toEqual([]);
		await out.redo!();
		expect(open()).toEqual(['sigmoid', 'sigmoid']);
	});
});
