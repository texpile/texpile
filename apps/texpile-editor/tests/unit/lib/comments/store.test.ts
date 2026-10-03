import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { buildAnchor, type CommentAnchor } from '$lib/comments/anchor';
import { anchorEvent, deleteEvent, openEvent, replyEvent, resolveEvent, foldLog, parseLog, type CommentEvent } from '$lib/comments/log';

let disk = '';
/** what a read of the log under /w throws instead, as the fs bridge words it */
let readError: string | null = null;
/** per path, for tests that keep more than one log */
const disks: Record<string, string> = {};

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async (path: string) => {
		if (path.startsWith('/w/') && readError) throw new Error(readError);
		return path.startsWith('/w/') ? disk : (disks[path] ?? '');
	},
	writeTextFile: async (path: string, text: string) => {
		if (path.startsWith('/w/')) disk = text;
		else disks[path] = text;
	}
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));

const { CommentStore } = await import('$lib/comments/store.svelte');
const { commentLogOf, shareCommentLog } = await import('$lib/collab/sharedComments');

it('writes back the lines it cannot read, in place, and drops merge leftovers', async () => {
	const open = JSON.stringify(
		openEvent({ id: 't1', file: 'main.tex', by: 'ana', body: 'hi', anchor: buildAnchor('some text', 0, 4), at: 'now' })
	);
	const newer = JSON.stringify({ v: 1, t: 'someday', thread: 't1', by: 'bo', at: 'now' });
	disk = [open, '<<<<<<< HEAD', newer, '>>>>>>> branch', ''].join('\n');

	const store = new CommentStore();
	await store.load('/w');
	await store.append(replyEvent({ id: 'm2', thread: 't1', by: 'ana', body: 'ok', at: 'now' }));

	const lines = disk.trim().split('\n');
	expect(lines).toHaveLength(3);
	expect(lines[0]).toBe(open);
	expect(lines[1]).toBe(newer);
	expect(JSON.parse(lines[2]).t).toBe('reply');
});

it('serves staged events with the written ones, and says whether a discard dropped any', async () => {
	disk = '';
	const store = new CommentStore();
	await store.load('/w');
	const open = openEvent({
		id: 't1',
		file: 'main.tex',
		by: 'ana',
		body: '',
		anchor: buildAnchor('some text', 0, 4),
		at: 'now',
		restore: 'old'
	});
	store.stage(open);
	expect(store.serialize()).toBe(JSON.stringify(open) + '\n');
	expect(disk).toBe('');
	expect(store.discardStaged('other.tex')).toBe(false);
	expect(store.discardStaged('main.tex')).toBe(true);
	expect(store.serialize()).toBe('\n');
});

// a read from disk can land after this side's own newer write
it('keeps what this side appended when an older read of the log lands', async () => {
	const store = new CommentStore();
	await store.load(null);
	const hostOpen = openEvent({ id: 'h1', file: 'main.tex', by: 'louis', body: 'first', anchor: buildAnchor('some text', 0, 4), at: 'now' });
	const guestOpen = openEvent({ id: 'g1', file: 'main.tex', by: 'mei', body: 'mine', anchor: buildAnchor('some text', 5, 9), at: 'now' });
	await store.append(guestOpen);

	store.adoptLog(JSON.stringify(hostOpen) + '\n');
	expect(store.threads.map((t) => t.id)).toEqual(['h1', 'g1']);

	// the next catch-up has it: once, not twice
	store.adoptLog([hostOpen, guestOpen].map((e) => JSON.stringify(e)).join('\n') + '\n');
	expect(store.threads.map((t) => t.id)).toEqual(['h1', 'g1']);
	expect(store.serialize().trim().split('\n')).toHaveLength(2);
});

// File > Open Folder swaps the root of the same store in place
it('keeps the last folder’s threads out of the next folder’s log', async () => {
	const anchor = buildAnchor('some text', 0, 4);
	disks['/a/.texpile/comments.jsonl'] =
		JSON.stringify(openEvent({ id: 'a1', file: 'main.tex', by: 'ana', body: 'a', anchor, at: 'now' })) + '\n';
	disks['/b/.texpile/comments.jsonl'] =
		JSON.stringify(openEvent({ id: 'b1', file: 'main.tex', by: 'bo', body: 'b', anchor, at: 'now' })) + '\n';
	const store = new CommentStore();
	await store.load('/a');
	await store.load('/b');
	expect(store.threads.map((t) => t.id)).toEqual(['b1']);

	await store.append(replyEvent({ id: 'm1', thread: 'b1', by: 'bo', body: 'ok', at: 'now' }));
	expect(foldLog(parseLog(disks['/b/.texpile/comments.jsonl'])).map((t) => t.id)).toEqual(['b1']);
});

const threadOn = (id: string) =>
	openEvent({ id, file: 'main.tex', by: 'ana', body: id, anchor: buildAnchor('some text', 0, 4), at: 'now' });

// Discard changes in Source Control, a checkout
it('lets go of threads taken out of the log on disk', async () => {
	const committed = JSON.stringify(threadOn('c1')) + '\n';
	disk = committed;
	const store = new CommentStore();
	await store.load('/w');
	await store.append(threadOn('c2'));
	disk = committed;
	await store.reload();
	expect(store.threads.map((t) => t.id)).toEqual(['c1']);

	await store.append(replyEvent({ id: 'm1', thread: 'c1', by: 'bo', body: 'ok', at: 'now' }));
	expect(foldLog(parseLog(disk)).map((t) => t.id)).toEqual(['c1']);
});

// a checkout of a branch without one, or the file deleted by hand
it('lets go of the threads of a log deleted on disk, and only of a deleted one', async () => {
	disk = JSON.stringify(threadOn('c1')) + '\n';
	const store = new CommentStore();
	await store.load('/w');
	readError = 'EBUSY: resource busy or locked, open';
	await store.reload();
	expect(store.threads.map((t) => t.id)).toEqual(['c1']);
	readError = null;
	await store.reload();

	readError = "ENOENT: no such file or directory, open '/w/.texpile/comments.jsonl'";
	await store.reload();
	readError = null;
	expect(store.threads).toEqual([]);
	await store.append(threadOn('n1'));
	expect(foldLog(parseLog(disk)).map((t) => t.id)).toEqual(['n1']);
});

it('keeps every thread when a read lands short while its own write is under way', async () => {
	disk = '';
	const store = new CommentStore();
	await store.load('/w');
	await store.append(threadOn('c1'));
	const writing = store.append(threadOn('c2'));
	// the file caught half rewritten
	disk = '';
	await Promise.all([writing, store.reload()]);
	expect(store.threads.map((t) => t.id)).toEqual(['c1', 'c2']);
	expect(foldLog(parseLog(disk)).map((t) => t.id)).toEqual(['c1', 'c2']);
});

// Don't Save after a reply wrote the log while the file had unsaved suggestions
it('puts back what a write took early of staged events thrown away, and nothing once the file is saved', async () => {
	const text = 'We prove the estimator is sharp for smooth solutions.';
	const saved = buildAnchor(text, 26, 31);
	const open = openEvent({ id: 's', file: 'main.tex', by: 'ana', body: '', anchor: saved, at: 'then', restore: 'blunt' });
	disk = JSON.stringify(open) + '\n';
	const store = new CommentStore();
	await store.load('/w');
	const typing = () =>
		store.stage(
			anchorEvent({ thread: 's', anchor: buildAnchor(text, 26, 35), restore: 'blunt fo', by: 'ana', at: 'now' }),
			openEvent({ id: 'x', file: 'main.tex', by: 'ana', body: '', anchor: buildAnchor(text, 0, 2), at: 'now', restore: 'Here' })
		);
	typing();
	await store.append(replyEvent({ id: 'm1', thread: 's', by: 'bo', body: 'ok', at: 'now' }));
	store.discardStaged('main.tex');
	await store.append(...store.takeBack('main.tex', 'ana'));
	const back = foldLog(parseLog(disk));
	expect(back.map((t) => [t.id, t.anchor, t.restore])).toEqual([['s', saved, 'blunt']]);

	typing();
	await store.append(replyEvent({ id: 'm2', thread: 's', by: 'bo', body: 'ok', at: 'now' }));
	store.saved('main.tex');
	expect(store.takeBack('main.tex', 'ana')).toEqual([]);
});

/** deterministic PRNG (mulberry32) so a failure reproduces byte-for-byte */
function rng(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** two copies of a shared doc that pass every change straight to each other, as a session does */
function linkedDocs(): [Y.Doc, Y.Doc] {
	const a = new Y.Doc();
	const b = new Y.Doc();
	a.on('update', (u: Uint8Array, origin: unknown) => origin !== b && Y.applyUpdate(b, u, a));
	b.on('update', (u: Uint8Array, origin: unknown) => origin !== a && Y.applyUpdate(a, u, b));
	return [a, b];
}

/** a host store and a guest store on one session log */
function session(root: string) {
	const [hostDoc, guestDoc] = linkedDocs();
	const host = new CommentStore();
	const guest = new CommentStore();
	const share = {
		host: shareCommentLog(commentLogOf(hostDoc), 'host', () => host.follow()),
		guest: shareCommentLog(commentLogOf(guestDoc), 'guest', () => guest.follow())
	};
	return {
		host,
		guest,
		log: () => commentLogOf(hostDoc).toArray(),
		disk: () => disks[`${root}/.texpile/comments.jsonl`] ?? '',
		async start() {
			await host.load(root);
			await guest.load(null);
			host.startSharing(share.host, true);
			guest.startSharing(share.guest, false);
		}
	};
}

const anchorAt = (from: number, to: number): CommentAnchor =>
	buildAnchor('We prove the estimator is sharp for smooth solutions.', from, to);
const typed = (id: string, restore: string) =>
	openEvent({ id, file: 'main.tex', by: 'ana', body: '', anchor: anchorAt(0, 2), at: 'now', restore });

const STORE_SHARE_RUNS = Number(process.env.STORE_SHARE_RUNS ?? 60);

describe('a store following a session log', () => {
	it('puts the host log and staged events in first, and keeps the staged ones off disk until a save', async () => {
		const opened = openEvent({ id: 'c1', file: 'main.tex', by: 'ana', body: 'hm', anchor: anchorAt(3, 8), at: 'now' });
		disks['/seed/.texpile/comments.jsonl'] = JSON.stringify(opened) + '\n';
		const s = session('/seed');
		await s.host.load('/seed');
		s.host.stage(typed('s1', 'Our'));
		await s.start();
		expect(s.guest.threads.map((t) => t.id)).toEqual(['c1', 's1']);
		expect(parseLog(s.disk()).map((e) => e.t)).toEqual(['open']);
		await s.host.append();
		expect(parseLog(s.disk()).map((e) => (e.t === 'open' ? e.id : e.t))).toEqual(['c1', 's1']);
	});

	it('keeps one unsaved anchor per suggestion in the session, not one per keystroke', async () => {
		const s = session('/anchors');
		await s.start();
		s.host.stage(typed('s1', 'Our'));
		for (let i = 1; i <= 20; i++) {
			const restore = i === 1 ? { restore: 'Ours' } : {};
			s.host.stage(anchorEvent({ thread: 's1', anchor: anchorAt(0, i), by: 'ana', at: `t${i}`, ...restore }));
		}
		expect(s.log()).toHaveLength(2);
		expect(s.guest.threads[0].anchor.end).toBe(20);
		expect(s.guest.threads[0].restore).toBe('Ours');
		await s.host.append();
		// saved as one line, the way a solo save collapses the staged events
		expect(s.log()).toHaveLength(1);
		expect(parseLog(s.disk())).toEqual([{ ...typed('s1', 'Ours'), anchor: anchorAt(0, 20) }]);
	});

	it('takes lines someone added to the file during the session into it, and only those', async () => {
		const s = session('/pulled');
		await s.start();
		await s.host.append(replyEvent({ id: 'r0', thread: 'none', by: 'ana', body: 'x', at: 'now' }));
		const pulled = openEvent({ id: 'p1', file: 'main.tex', by: 'bo', body: 'from git', anchor: anchorAt(3, 8), at: 'later' });
		disks['/pulled/.texpile/comments.jsonl'] = s.disk() + JSON.stringify(pulled) + '\n';
		await s.host.reload();
		expect(s.log()).toHaveLength(2);
		expect(s.guest.threads.map((t) => t.id)).toEqual(['p1']);
		await s.host.reload();
		expect(s.log()).toHaveLength(2);
	});

	it('stages again what was unsaved when the session ends', async () => {
		const s = session('/ends');
		await s.start();
		s.host.stage(typed('s1', 'Our'));
		s.host.stopSharing();
		expect(s.host.hasStaged).toBe(true);
		expect(s.host.serialize()).toBe(JSON.stringify(typed('s1', 'Our')) + '\n');
	});

	// the oracle: any run of staged events, saves, replies and discards writes byte for byte what the
	// store writes on its own, and a guest following the session sees the same threads throughout
	it(
		'writes what a store on its own writes, for any run of staged events and saves',
		async () => {
			for (let seed = 1; seed <= STORE_SHARE_RUNS; seed++) {
				// every open is a new thread, as a random id makes it in the app; the rest name an opened one
				const ids: string[] = [];
				const rand = rng(seed);
				const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
				const solo = new CommentStore();
				await solo.load(`/solo${seed}`);
				const s = session(`/shared${seed}`);
				await s.start();
				const both = async (f: (store: InstanceType<typeof CommentStore>) => unknown) => {
					await f(solo);
					await f(s.host);
				};
				const done: string[] = [];
				for (let step = 0; step < 40; step++) {
					const roll = ids.length ? rand() : 0;
					const id = roll < 0.2 ? `s${ids.push(`s${ids.length}`) - 1}` : pick(ids);
					const at = `t${step}`;
					const anchor = anchorAt(Math.floor(rand() * 10), 10 + Math.floor(rand() * 20));
					let e: CommentEvent | null = null;
					if (roll < 0.2) e = openEvent({ id, file: 'main.tex', by: 'ana', body: '', anchor, at, restore: pick(['', 'old', 'older']) });
					else if (roll < 0.5) {
						const restore = rand() < 0.5 ? { restore: pick(['', 'a', 'b']) } : {};
						const file = rand() < 0.15 ? { file: pick(['main.tex', 'other.tex']) } : {};
						e = anchorEvent({ thread: id, anchor, by: 'ana', at, ...restore, ...file });
					} else if (roll < 0.58) e = resolveEvent({ thread: id, resolved: true, decision: 'closed', by: 'ana', at });
					else if (roll < 0.66) e = deleteEvent({ thread: id, by: 'ana', at });
					if (e) {
						const staged = e;
						done.push(`stage ${JSON.stringify(e)}`);
						await both((store) => store.stage(staged));
					} else if (roll < 0.8) {
						done.push('save');
						await both((store) => store.append());
					} else if (roll < 0.9) {
						done.push(`reply ${id}`);
						await both((store) => store.append(replyEvent({ id: `r${step}`, thread: id, by: 'bo', body: 'ok', at })));
					} else {
						const file = pick(['main.tex', 'other.tex']);
						done.push(`discard ${file}`);
						await both((store) => store.discardStaged(file));
					}
					const where = [`seed ${seed} step ${step}`, ...done.slice(-12)].join('\n');
					expect(JSON.stringify(s.host.threads), where).toBe(JSON.stringify(solo.threads));
					expect(JSON.stringify(s.guest.threads), where).toBe(JSON.stringify(solo.threads));
					expect(s.disk(), where).toBe(disks[`/solo${seed}/.texpile/comments.jsonl`] ?? '');
				}
				await both((store) => store.append());
				expect(s.disk()).toBe(disks[`/solo${seed}/.texpile/comments.jsonl`] ?? '');
				expect(foldLog(parseLog(s.log().join('\n')))).toEqual(solo.threads);
			}
		},
		30_000 + STORE_SHARE_RUNS * 20
	);
});
