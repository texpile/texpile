// A rename takes a file's Local History along, and adds an entry holding what the file holds now.
// That entry is kept in LF, as saves are, and with Keep local history off nothing is added at all.
import { it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalHistory } from '../../../../../../electron/src/localHistory';

const homes: string[] = [];
let store: LocalHistory;
const move = vi.fn((from: string, to: string) => store.move(from, to));
vi.mock('$lib/workspace/fileSystem', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/workspace/fileSystem')>()),
	nativeBridge: () => ({
		localHistoryAdd: (p: string, c: string, s?: string) => store.add(p, c, s),
		localHistoryMove: move
	})
}));

const { moveLocalHistory } = await import('$lib/workspace/localHistory/localHistory.svelte');
const { settings } = await import('$lib/settings');

afterEach(() => {
	for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
	settings.current = { ...settings.current, localHistory: true };
	move.mockClear();
});

function fresh(): void {
	const home = mkdtempSync(join(tmpdir(), 'texpile-history-move-'));
	homes.push(home);
	store = new LocalHistory(home);
}

const FILE = join(tmpdir(), 'project', 'intro.tex');
const RENAMED = join(tmpdir(), 'project', 'introduction.tex');

it('keeps what a renamed CRLF file holds in LF, so its next unchanged save adds nothing', async () => {
	fresh();
	await store.add(FILE, 'one\ntwo\n', undefined, undefined, 1_000);
	// changed outside since (a pull), and written with Windows line endings
	await moveLocalHistory(FILE, RENAMED, async () => 'one\r\ntwo\r\nthree\r\n');
	await store.add(RENAMED, 'one\ntwo\nthree\n');
	const entries = await store.list(RENAMED);
	expect(entries.map((e) => e.source)).toEqual([undefined, 'renamed']);
	expect(await store.read(RENAMED, entries[1].id)).toBe('one\ntwo\nthree\n');
});

it('reads nothing to add when Keep local history is off, and the entries still go along', async () => {
	fresh();
	await store.add(FILE, 'one', undefined, undefined, 1_000);
	settings.current = { ...settings.current, localHistory: false };
	const readText = vi.fn(async () => 'one, then more');
	await moveLocalHistory(FILE, RENAMED, readText);
	expect(move).toHaveBeenCalledWith(FILE, RENAMED);
	expect(readText).not.toHaveBeenCalled();
});
