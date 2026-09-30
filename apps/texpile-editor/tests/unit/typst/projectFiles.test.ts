// The session's files, pushed to the host's own tinymist as open documents.
//
// This set exists because the disk is measurably too slow: with any document open, tinymist picks
// up disk writes through a file watcher that lags by over a second, so a completion asked right
// after a guest's keystroke was answered about the text before it. Open documents have no watcher
// in the loop. The failure modes here are all quiet ones - a stale answer, a duplicate open
// fighting the host's editor, a didClose yanking the host's own document - so each is pinned.
import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectFileSet, PROJECT_FILE_RE, languageIdFor } from '$lib/languages/typst/projectFiles';
import type { LSPClient } from '@codemirror/lsp-client';

type Call = { kind: 'open' | 'change' | 'close'; uri: string; text?: string; version?: number; languageId?: string };

function fakeClient() {
	const calls: Call[] = [];
	// URIs the EDITOR has open (a live view on the workspace entry); the set must defer to these
	const editorOwned = new Set<string>();
	// URIs the visual editor streams: a workspace entry with no view, which is the editor's all the same
	const streamed = new Set<string>();
	// URIs the server has open, whoever opened them
	const workspaceFiles = new Set<string>();
	const client = {
		didOpen: (f: { uri: string; version: number; languageId: string; doc: { toString(): string } }) => {
			workspaceFiles.add(f.uri);
			calls.push({ kind: 'open', uri: f.uri, text: f.doc.toString(), version: f.version, languageId: f.languageId });
		},
		didClose: (uri: string) => {
			workspaceFiles.delete(uri);
			calls.push({ kind: 'close', uri });
		},
		notification: (_m: string, p: { textDocument: { uri: string; version: number }; contentChanges: { text: string }[] }) =>
			calls.push({ kind: 'change', uri: p.textDocument.uri, text: p.contentChanges[0].text, version: p.textDocument.version }),
		workspace: {
			getFile: (uri: string) => (streamed.has(uri) || editorOwned.has(uri) ? { getView: () => (editorOwned.has(uri) ? {} : null) } : null)
		}
	} as unknown as LSPClient;
	return { client, calls, editorOwned, streamed, workspaceFiles };
}

const uriFor = (rel: string) => `file:///root/${rel}`;
const f = (rel: string, text: string) => ({ rel, text });

describe('the project handed to the server', () => {
	let calls: Call[];
	let editorOwned: Set<string>;
	let streamed: Set<string>;
	let workspaceFiles: Set<string>;
	let set: ProjectFileSet;

	beforeEach(() => {
		const fake = fakeClient();
		calls = fake.calls;
		editorOwned = fake.editorOwned;
		streamed = fake.streamed;
		workspaceFiles = fake.workspaceFiles;
		set = new ProjectFileSet(fake.client, uriFor);
	});

	it('opens the project, minus the file the host editor owns', () => {
		editorOwned.add(uriFor('main.typ'));
		set.reconcile([f('main.typ', 'A'), f('lib.typ', 'B')]);
		expect(calls).toEqual([{ kind: 'open', uri: uriFor('lib.typ'), text: 'B', version: 1, languageId: 'typst' }]);
	});

	it('an edited file sends one didChange, not a reopen', () => {
		set.reconcile([f('lib.typ', 'B')]);
		calls.length = 0;
		set.reconcile([f('lib.typ', 'B v2')]);
		expect(calls).toEqual([{ kind: 'change', uri: uriFor('lib.typ'), text: 'B v2', version: 2 }]);
	});

	it('versions climb, because a server may reject one that goes backwards', () => {
		set.reconcile([f('lib.typ', '1')]);
		set.reconcile([f('lib.typ', '2')]);
		set.reconcile([f('lib.typ', '3')]);
		expect(calls.map((c) => c.version)).toEqual([1, 2, 3]);
	});

	it('unchanged content says nothing at all', () => {
		set.reconcile([f('a.typ', 'x'), f('b.typ', 'y')]);
		calls.length = 0;
		set.reconcile([f('a.typ', 'x'), f('b.typ', 'y')]);
		expect(calls).toEqual([]);
	});

	it('a file added mid-session is opened; one removed is closed, not left answering', () => {
		set.reconcile([f('a.typ', 'x')]);
		calls.length = 0;
		set.reconcile([f('a.typ', 'x'), f('new.typ', 'z')]);
		set.reconcile([f('new.typ', 'z')]);
		expect(calls).toEqual([
			{ kind: 'open', uri: uriFor('new.typ'), text: 'z', version: 1, languageId: 'typst' },
			{ kind: 'close', uri: uriFor('a.typ') }
		]);
	});

	it('backs off a file the host editor takes over, WITHOUT closing it', () => {
		// a didClose here would close the editor's own document out from under the host
		set.reconcile([f('a.typ', 'x')]);
		calls.length = 0;
		editorOwned.add(uriFor('a.typ')); // the host opened it in their editor
		set.reconcile([f('a.typ', 'x edited by host')]);
		expect(calls).toEqual([]); // no close, no change - the editor owns the URI now
	});

	it('leaves the file the visual editor streams alone, though it has no view', () => {
		// a second opener would write the same URI on a version count of its own, and the stream's
		// next incremental change would land on text it never sent
		streamed.add(uriFor('main.typ'));
		set.reconcile([f('main.typ', 'A'), f('lib.typ', 'B')]);
		expect(calls).toEqual([{ kind: 'open', uri: uriFor('lib.typ'), text: 'B', version: 1, languageId: 'typst' }]);
		calls.length = 0;
		set.reconcile([f('main.typ', 'A edited'), f('lib.typ', 'B')]);
		expect(calls).toEqual([]);
	});

	it('re-adopts a file the host editor lets go of', () => {
		editorOwned.add(uriFor('a.typ'));
		set.reconcile([f('a.typ', 'x')]);
		expect(calls).toEqual([]);
		editorOwned.delete(uriFor('a.typ')); // host switched away; editor closed it
		set.reconcile([f('a.typ', 'x2')]);
		expect(calls).toEqual([{ kind: 'open', uri: uriFor('a.typ'), text: 'x2', version: 1, languageId: 'typst' }]);
	});

	it('dispose closes what it owns and leaves the editor file alone', () => {
		set.reconcile([f('a.typ', 'x'), f('b.typ', 'y')]);
		calls.length = 0;
		editorOwned.add(uriFor('a.typ'));
		set.dispose();
		expect(calls).toEqual([{ kind: 'close', uri: uriFor('b.typ') }]);
		expect(workspaceFiles.has(uriFor('b.typ'))).toBe(false);
	});

	it('one file failing does not cost the rest of the project', () => {
		const calls2: Call[] = [];
		const flaky = {
			didOpen: (file: { uri: string }) => {
				if (file.uri.endsWith('bad.typ')) throw new Error('nope');
				calls2.push({ kind: 'open', uri: file.uri });
			},
			didClose: () => {},
			notification: () => {},
			workspace: { getFile: () => null }
		} as unknown as LSPClient;
		new ProjectFileSet(flaky, uriFor).reconcile([f('bad.typ', 'x'), f('good.typ', 'y')]);
		expect(calls2).toEqual([{ kind: 'open', uri: uriFor('good.typ') }]);
	});
});

describe('which files reach the server, and as what', () => {
	it('takes the sources typst reads through the language server', () => {
		expect(PROJECT_FILE_RE.test('main.typ')).toBe(true);
		expect(PROJECT_FILE_RE.test('refs.bib')).toBe(true);
		expect(PROJECT_FILE_RE.test('notes.md')).toBe(false);
		expect(PROJECT_FILE_RE.test('logo.png')).toBe(false);
	});

	it('labels a bibliography as bibtex, not typst', () => {
		expect(languageIdFor('refs.bib')).toBe('bibtex');
		expect(languageIdFor('REFS.BIB')).toBe('bibtex');
		expect(languageIdFor('main.typ')).toBe('typst');
	});
});
