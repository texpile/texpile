// Local History as VS Code keeps it: a copy per save, saves close together from one source merged,
// the newest 50 kept, big files skipped, and a rename taking the entries along.
import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { LocalHistory, type LocalHistoryLimits } from '../../../../../../electron/src/localHistory';

const homes: string[] = [];
afterEach(() => {
	for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

function history(limits: Partial<LocalHistoryLimits> = { maxEntries: 50, maxFileSize: 1024, mergeWindowMs: 10_000 }) {
	const home = mkdtempSync(join(tmpdir(), 'texpile-history-'));
	homes.push(home);
	return { h: new LocalHistory(home, limits), home };
}

const FILE = join(tmpdir(), 'project', 'chapters', 'intro.tex');

it('keeps a copy per save, and merges saves within the window into the last one', async () => {
	const { h } = history();
	await h.add(FILE, 'one', undefined, undefined, 1_000);
	await h.add(FILE, 'two', undefined, undefined, 5_000); // 4 s later: replaces
	await h.add(FILE, 'three', undefined, undefined, 30_000); // 25 s later: a new entry
	const entries = await h.list(FILE);
	expect(entries.map((e) => e.timestamp)).toEqual([5_000, 30_000]);
	expect(await h.read(FILE, entries[0].id)).toBe('two');
	expect(await h.read(FILE, entries[1].id)).toBe('three');
	expect(entries[0].id).toMatch(/^[A-Za-z0-9]{4}\.tex$/);
});

it('does not merge across sources, and adds nothing for a save that changed nothing', async () => {
	const { h } = history();
	await h.add(FILE, 'text', undefined, undefined, 1_000);
	await h.add(FILE, 'text', undefined, undefined, 60_000);
	await h.add(FILE, 'text', 'restored', undefined, 61_000);
	expect((await h.list(FILE)).map((e) => e.source)).toEqual([undefined, 'restored']);
});

it('keeps the newest entries up to the limit, and skips files over the size limit', async () => {
	const { h, home } = history({ maxEntries: 3, maxFileSize: 10, mergeWindowMs: 0 });
	for (let i = 0; i < 5; i++) await h.add(FILE, `v${i}`, undefined, undefined, i * 1_000 + 1);
	const entries = await h.list(FILE);
	expect(await Promise.all(entries.map((e) => h.read(FILE, e.id)))).toEqual(['v2', 'v3', 'v4']);
	// the dropped copies are gone from disk as well: three copies and the listing
	expect(readdirSync(join(home, readdirSync(home)[0]))).toHaveLength(4);
	expect(await h.add(FILE, 'far too long for the limit', undefined, undefined, 99_000)).toBeNull();
});

it('reads only ids the file lists, never a path', async () => {
	const { h } = history();
	await h.add(FILE, 'text');
	expect(await h.read(FILE, '../../etc/passwd')).toBeNull();
	expect(await h.read(FILE, 'zzzz.tex')).toBeNull();
});

it('renames and deletes entries, and Delete All clears every file', async () => {
	const { h } = history();
	const e = (await h.add(FILE, 'text'))!;
	expect(await h.rename(FILE, e.id, 'Sent to the committee')).toBe(true);
	expect((await h.list(FILE))[0].source).toBe('Sent to the committee');
	expect(await h.remove(FILE, e.id)).toBe(true);
	expect(await h.list(FILE)).toEqual([]);
	await h.add(FILE, 'again');
	await h.removeAll();
	expect(await h.list(FILE)).toEqual([]);
});

it('takes the entries along when a file or its folder moves, and says where it was', async () => {
	const { h } = history();
	await h.add(FILE, 'first', undefined, undefined, 1_000);
	await h.add(FILE, 'second', undefined, undefined, 50_000);
	const renamed = join(tmpdir(), 'project', 'chapters', 'introduction.tex');
	expect(await h.move(FILE, renamed)).toEqual([renamed]);
	expect(await h.list(FILE)).toEqual([]);
	const after = await h.list(renamed);
	expect(after.map((e) => e.source)).toEqual([undefined, undefined, 'renamed']);
	expect(after[2].sourceDescription).toBe(FILE);
	expect(await h.read(renamed, after[2].id)).toBe('second');

	const moved = join(tmpdir(), 'project', 'parts', 'introduction.tex');
	expect(await h.move(join(tmpdir(), 'project', 'chapters'), join(tmpdir(), 'project', 'parts'))).toEqual([moved]);
	expect((await h.list(moved)).at(-1)?.source).toBe('moved');
});

it('replaces the rename entry with what the file holds now, keeping where it came from', async () => {
	const { h } = history();
	await h.add(FILE, 'saved in the app', undefined, undefined, 1_000);
	const renamed = join(tmpdir(), 'project', 'chapters', 'introduction.tex');
	await h.move(FILE, renamed);
	// what the window reads from disk after the rename: changed since by a pull
	await h.add(renamed, 'pulled since', 'renamed');
	const after = await h.list(renamed);
	expect(after.map((e) => e.source)).toEqual([undefined, 'renamed']);
	expect(after[1].sourceDescription).toBe(FILE);
	expect(await h.read(renamed, after[1].id)).toBe('pulled since');
});

it('keeps every copy when the listing is lost, as VS Code rebuilds it from the folder', async () => {
	const { h, home } = history();
	await h.add(FILE, 'one', undefined, undefined, 1_000);
	await h.add(FILE, 'two', undefined, undefined, 50_000);
	const [folder] = readdirSync(home);
	// a crash while entries.json was written
	writeFileSync(join(home, folder, 'entries.json'), '{"version":1,"reso');
	const listed = await h.list(FILE);
	expect(listed).toHaveLength(2);
	expect(await h.read(FILE, listed[0].id)).toBe('one');
	// the next save lists all three, and nothing is left behind unlisted
	await h.add(FILE, 'three', undefined, undefined, Date.now() + 60_000);
	expect(await h.list(FILE)).toHaveLength(3);
	expect(readdirSync(join(home, folder)).filter((n) => n !== 'entries.json')).toHaveLength(3);
});

it('lists every file with history under a folder, deleted ones too, newest first', async () => {
	const { h } = history();
	const project = join(tmpdir(), 'project');
	const methods = join(project, 'chapters', 'methods.tex');
	await h.add(FILE, 'intro', undefined, undefined, 1_000);
	await h.add(methods, 'methods', undefined, undefined, 5_000);
	await h.add(join(tmpdir(), 'elsewhere', 'other.tex'), 'not this project', undefined, undefined, 9_000);
	expect(await h.all(project)).toEqual([
		{ resource: methods, count: 1, newest: 5_000 },
		{ resource: FILE, count: 1, newest: 1_000 }
	]);
	// a folder named like the project's start is not inside it
	expect(await h.all(join(tmpdir(), 'proj'))).toEqual([]);
});

it('carries a file whose listing was lost when it is renamed, as its folder is named by its path', async () => {
	const { h, home } = history();
	await h.add(FILE, 'one', undefined, undefined, 1_000);
	await h.add(FILE, 'two', undefined, undefined, 50_000);
	writeFileSync(join(home, readdirSync(home)[0], 'entries.json'), '{"version":1,"reso');
	const renamed = join(tmpdir(), 'project', 'chapters', 'introduction.tex');
	expect(await h.move(FILE, renamed)).toEqual([renamed]);
	const after = await h.list(renamed);
	expect(await Promise.all(after.map((e) => h.read(renamed, e.id)))).toEqual(['one', 'two', 'two']);
	expect(await h.all(join(tmpdir(), 'project'))).toEqual([{ resource: renamed, count: 3, newest: after[2].timestamp }]);
});

it('keeps the old folder when a copy cannot be read during a move, rather than losing it', async () => {
	const { h, home } = history();
	await h.add(FILE, 'one', undefined, undefined, 1_000);
	const locked = (await h.add(FILE, 'two', undefined, undefined, 50_000))!;
	const [folder] = readdirSync(home);
	// a copy another program holds open: reading it fails with something other than "not there"
	rmSync(join(home, folder, locked.id));
	mkdirSync(join(home, folder, locked.id));
	const renamed = join(tmpdir(), 'project', 'chapters', 'introduction.tex');
	await h.move(FILE, renamed);
	expect(readdirSync(home)).toContain(folder);
	expect(readdirSync(join(home, folder))).toContain(locked.id);
});

it('makes the rename entry from the moved file, not from history the new path already had', async () => {
	const { h } = history();
	const renamed = join(tmpdir(), 'project', 'chapters', 'introduction.tex');
	// a file of that name, deleted since, saved more recently than this one
	await h.add(renamed, 'the deleted file', undefined, undefined, 90_000);
	await h.add(FILE, 'this file', undefined, undefined, 1_000);
	await h.move(FILE, renamed);
	const after = await h.list(renamed);
	expect(after.at(-1)?.source).toBe('renamed');
	expect(await h.read(renamed, after.at(-1)!.id)).toBe('this file');
});

it('gives a carried copy a name of its own when the new path has one differing only in case', async () => {
	const { h, home } = history();
	const renamed = join(tmpdir(), 'project', 'chapters', 'introduction.tex');
	const mine = (await h.add(FILE, 'this file', undefined, undefined, 1_000))!;
	const theirs = (await h.add(renamed, 'the other file', undefined, undefined, 2_000))!;
	// the other file's copy renamed to this one's name in another case, as a case-insensitive disk sees them
	const clash = mine.id.slice(0, 4).replace(/[a-z]/gi, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())) + '.tex';
	const theirFolder = readdirSync(home).find((f) => readdirSync(join(home, f)).includes(theirs.id))!;
	renameSync(join(home, theirFolder, theirs.id), join(home, theirFolder, clash));
	const listing = join(home, theirFolder, 'entries.json');
	writeFileSync(listing, readFileSync(listing, 'utf8').replace(theirs.id, clash));
	await h.move(FILE, renamed);
	const ids = (await h.list(renamed)).map((e) => e.id.toLowerCase());
	expect(new Set(ids).size).toBe(ids.length);
	const texts = await Promise.all((await h.list(renamed)).map((e) => h.read(renamed, e.id)));
	expect(texts).toEqual(['this file', 'the other file', 'this file']);
});

it('lists files for a project at the root of a drive', async () => {
	const { h } = history();
	await h.add(FILE, 'intro', undefined, undefined, 1_000);
	expect((await h.all(sep)).map((f) => f.resource)).toEqual([FILE]);
});

it('keeps a file whose name ends in a dot, whose copies are named without an extension', async () => {
	const { h } = history();
	const odd = join(tmpdir(), 'project', 'notes.');
	const e = (await h.add(odd, 'text'))!;
	expect(e.id).toMatch(/^[A-Za-z0-9]{4}$/);
	expect((await h.list(odd)).map((x) => x.id)).toEqual([e.id]);
	expect(await h.read(odd, e.id)).toBe('text');
});

it('adds nothing for an unchanged save after a rename or restore, but keeps an entry asked for by name', async () => {
	const { h } = history();
	await h.add(FILE, 'text', undefined, undefined, 1_000);
	await h.add(FILE, 'text', 'restored', undefined, 60_000);
	await h.add(FILE, 'text', undefined, undefined, 120_000);
	await h.add(FILE, 'text', 'Sent to the committee', undefined, 180_000);
	expect((await h.list(FILE)).map((e) => e.source)).toEqual([undefined, 'restored', 'Sent to the committee']);
});

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

it('gathers saves into one copy until it is 5 minutes old, however often they came', async () => {
	const { h } = history({ mergeWindowMs: 5 * MIN });
	for (const at of [0, 1, 2, 3, 4.5]) await h.add(FILE, `at ${at}`, undefined, undefined, 1_000 + at * MIN);
	await h.add(FILE, 'at 5', undefined, undefined, 1_000 + 5 * MIN);
	const entries = await h.list(FILE);
	expect(entries).toHaveLength(2);
	expect(await h.read(FILE, entries[0].id)).toBe('at 4.5');
	expect(entries[0].started).toBe(1_000);
	expect(await h.read(FILE, entries[1].id)).toBe('at 5');
});

it('keeps every copy for 7 days, the last of each day to 30, a named one always, and the newest', async () => {
	const { h } = history({ mergeWindowMs: 0 });
	// local calendar days, as the history keeps "the last of each day" where the author is
	const at = (daysAgo: number, hour = 12) => new Date(2026, 3, 100 - daysAgo, hour).getTime();
	const now = at(0);
	await h.add(FILE, '40 days ago', undefined, undefined, at(40));
	await h.add(FILE, 'named, 40 days ago', 'Sent to the committee', undefined, at(40, 13));
	await h.add(FILE, '20 days ago, morning', undefined, undefined, at(20, 9));
	await h.add(FILE, '20 days ago, evening', undefined, undefined, at(20, 18));
	await h.add(FILE, '3 days ago, morning', undefined, undefined, at(3, 9));
	await h.add(FILE, '3 days ago, evening', undefined, undefined, at(3, 18));
	await h.add(FILE, 'now', undefined, undefined, now);
	const texts = await Promise.all((await h.list(FILE)).map((e) => h.read(FILE, e.id)));
	expect(texts).toEqual(['named, 40 days ago', '20 days ago, evening', '3 days ago, morning', '3 days ago, evening', 'now']);
});

it('keeps under the size cap by removing the oldest copies first, each file keeping its newest', async () => {
	const { h } = history({ mergeWindowMs: 0, maxTotalBytes: 30 });
	const other = join(tmpdir(), 'project', 'refs.bib');
	await h.add(FILE, 'aaaaaaaaaa', undefined, undefined, 1_000); // 10 bytes each
	await h.add(other, 'bbbbbbbbbb', undefined, undefined, 2_000);
	await h.add(FILE, 'cccccccccc', undefined, undefined, 3_000);
	await h.add(FILE, 'dddddddddd', undefined, undefined, 4_000);
	expect(await h.usage()).toBe(40);
	await h.prune(5_000);
	expect(await h.usage()).toBe(30);
	expect(await Promise.all((await h.list(FILE)).map((e) => h.read(FILE, e.id)))).toEqual(['cccccccccc', 'dddddddddd']);
	expect(await h.list(other)).toHaveLength(1);
});

it('prune thins a file no longer being saved by the same age rules', async () => {
	const { h } = history({ mergeWindowMs: 0 });
	await h.add(FILE, 'old', undefined, undefined, 1_000);
	await h.add(FILE, 'last', undefined, undefined, 2_000);
	await h.prune(2_000 + 60 * DAY);
	expect(await Promise.all((await h.list(FILE)).map((e) => h.read(FILE, e.id)))).toEqual(['last']);
});

it('never gathers a copy kept before a Reload or Discard, or a named one, into the next', async () => {
	const { h } = history({ mergeWindowMs: 5 * MIN });
	// Reload over unsaved text, then again a few minutes later over what was written since
	await h.add(FILE, 'saved', undefined, undefined, 1_000);
	await h.add(FILE, 'unsaved, first', 'before-reload', undefined, 1_000 + MIN);
	await h.add(FILE, 'unsaved, second', 'before-reload', undefined, 1_000 + 3 * MIN);
	await h.add(FILE, 'discarded, first', 'before-discard', undefined, 1_000 + 4 * MIN);
	await h.add(FILE, 'discarded, second', 'before-discard', undefined, 1_000 + 4.5 * MIN);
	await h.add(FILE, 'draft A', 'Draft', undefined, 1_000 + 4.6 * MIN);
	await h.add(FILE, 'draft B', 'Draft', undefined, 1_000 + 4.7 * MIN);
	const texts = await Promise.all((await h.list(FILE)).map((e) => h.read(FILE, e.id)));
	expect(texts).toEqual(['saved', 'unsaved, first', 'unsaved, second', 'discarded, first', 'discarded, second', 'draft A', 'draft B']);
});

it('keeps a named copy under the size cap, however old', async () => {
	const { h } = history({ mergeWindowMs: 0, maxTotalBytes: 30 });
	const other = join(tmpdir(), 'project', 'refs.bib');
	await h.add(FILE, 'NAMEDNAMED', 'Sent to the committee', undefined, 1_000); // 10 bytes each
	await h.add(other, 'bbbbbbbbbb', undefined, undefined, 2_000);
	await h.add(FILE, 'cccccccccc', undefined, undefined, 3_000);
	await h.add(FILE, 'dddddddddd', undefined, undefined, 4_000);
	await h.prune(5_000);
	expect(await h.usage()).toBe(30);
	expect((await h.list(FILE)).map((e) => e.source)).toEqual(['Sent to the committee', undefined]);
	expect(await h.list(other)).toHaveLength(1);
});

it('takes the entries along on a rename without adding one when history is turned off', async () => {
	const { h } = history();
	await h.add(FILE, 'first', undefined, undefined, 1_000);
	const renamed = join(tmpdir(), 'project', 'chapters', 'introduction.tex');
	expect(await h.move(FILE, renamed, false)).toEqual([renamed]);
	expect(await h.list(FILE)).toEqual([]);
	expect((await h.list(renamed)).map((e) => e.source)).toEqual([undefined]);
});
