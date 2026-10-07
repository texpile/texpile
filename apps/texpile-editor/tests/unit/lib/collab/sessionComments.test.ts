// @vitest-environment jsdom
// review comments between a host and a guest through the real session engine: sealed frames over a
// blind relay, the shared Y.Text, the host's text buffers landing every edit on its disk
import { it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { deriveSessionKeys } from '$lib/collab/e2e/keys';
import { generateShareCode } from '$lib/collab/e2e/shareCode';
import { CollabSession, textOf, type SessionEvents } from '$lib/collab/session';
import { EDIT_ORIGIN, changedSpans } from '$lib/collab/sharedFiles';
import { TextBuffers } from '$lib/buffers/textBuffers';
import { commentLogOf, shareComments } from '$lib/collab/sharedComments';
import type { RelayNotice } from '$lib/collab/protocol';
import type { Transport, TransportStatus } from '$lib/collab/transport';
import { buildAnchor } from '$lib/comments/anchor';
import { openEvent, parseLog, serializeLog, type CommentEvent } from '$lib/comments/log';

let disk: Record<string, string> = {};

vi.mock('$lib/workspace/fileSystem', () => ({
	readTextFile: async (path: string) => {
		const hit = Object.entries(disk).find(([k]) => path.replace(/\\/g, '/').endsWith(k));
		if (!hit) throw new Error(`ENOENT ${path}`);
		return hit[1];
	},
	writeTextFile: async (path: string, text: string) => {
		disk[path.replace(/\\/g, '/').replace(/^\/w\//, '')] = text;
	},
	joinPath: (a: string, b: string) => `${a}/${b}`
}));
vi.mock('$lib/workspace/texpileDir', () => ({
	texpilePath: (root: string, name: string) => `${root}/.texpile/${name}`,
	ensureTexpileIgnore: async () => {}
}));
vi.mock('$lib/comments/author', () => ({
	resolveAuthor: async (root: string | null) => (root === 'session' ? 'mei' : 'louis'),
	forgetAuthor: () => {}
}));

const { CommentsController } = await import('$lib/workspace/commentsController.svelte');

class FakeHub {
	transports = new Set<FakeTransport>();
	deliver(from: FakeTransport, data: Uint8Array): void {
		for (const t of this.transports) if (t !== from && !t.closed) setTimeout(() => t.onMessage?.(data, from.role === 'host'), 0);
	}
}

class FakeTransport implements Transport {
	onMessage: ((data: Uint8Array, fromHost: boolean) => void) | null = null;
	onNotice: ((n: RelayNotice) => void) | null = null;
	onStatus: ((s: TransportStatus, detail?: string) => void) | null = null;
	closed = false;
	constructor(
		private hub: FakeHub,
		readonly role: 'host' | 'guest'
	) {}
	start(): void {
		this.hub.transports.add(this);
		setTimeout(() => this.onStatus?.('connected'), 0);
	}
	send(data: Uint8Array<ArrayBuffer>): void {
		if (!this.closed) this.hub.deliver(this, data);
	}
	close(): void {
		this.closed = true;
		this.hub.transports.delete(this);
	}
}

async function until(cond: () => boolean, ms = 10000): Promise<void> {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > ms) throw new Error('condition not reached in time');
		await new Promise((r) => setTimeout(r, 10));
	}
}

const TEXT = 'We prove the estimator is sharp for smooth solutions.\n';
const logged = () => parseLog(disk['.texpile/comments.jsonl'] ?? '');

function suggestion(id: string, words: string, restore: string) {
	const at = TEXT.indexOf(words);
	return openEvent({ id, file: 'main.tex', anchor: buildAnchor(TEXT, at, at + words.length), body: '', by: 'louis', at: 'now', restore });
}

async function connect(log: CommentEvent[], hostOpens: string | null = '/w/main.tex') {
	disk = { 'main.tex': TEXT, '.texpile/comments.jsonl': serializeLog(log) };
	const key = (await deriveSessionKeys(generateShareCode())).contentKey;
	const hub = new FakeHub();
	const party = (role: 'host' | 'guest', name: string, events: SessionEvents, buffers?: TextBuffers) => {
		const doc = buffers?.shared ?? new Y.Doc();
		const transport = new FakeTransport(hub, role);
		const session = new CollabSession({
			doc,
			awareness: buffers?.awareness,
			transport,
			key,
			role,
			user: { name, color: '#123456' },
			events
		});
		transport.start();
		return { doc, session };
	};

	const writes: { tex: string; log: CommentEvent[] }[] = [];
	const buffers = new TextBuffers(
		'/w',
		{
			readBytes: async (p) => new TextEncoder().encode(disk[p.replace(/^\/w\//, '')]),
			writeText: async (p, content) => {
				const rel = p.replace(/^\/w\//, '');
				if (rel === 'main.tex') writes.push({ tex: content, log: logged() });
				disk[rel] = content;
			},
			listFiles: async () => [{ rel: 'main.tex', size: disk['main.tex'].length }]
		},
		(root, rel) => `${root}/${rel}`
	);
	let hostText = TEXT;
	const host = party('host', 'louis', {}, buffers);
	host.session.setSuggesting(false);
	// the host's editor folds its own edits into the buffer, which writes them
	const hostEdit = (next: string) => {
		hostText = next;
		hostCtl.suggestions.textChanged('/w/main.tex', next);
		buffers.fold('main.tex', next);
	};
	const hostCtl = new CommentsController({
		root: () => '/w',
		preferredAuthor: () => '',
		openFileAt: () => {},
		activeText: () => hostText,
		mode: () => 'editing',
		applyEdit: async (e) => {
			if (!hostOpens) return false;
			hostEdit(hostText.slice(0, e.from) + e.insert + hostText.slice(e.to));
			return true;
		},
		saveNow: () => {}
	});
	// as WorkspaceView wires it
	buffers.hooks.beforeWrite = (path, content) => hostCtl.suggestions.beforeSave(path.replace(/^\/w\//, ''), content);
	buffers.senderOf = (origin) => host.session.senderOf(origin);
	buffers.onRemoteChange = (rel, before, after, from, gestures) =>
		hostCtl.remoteEdit(rel, before, after, { ...host.session.authorOf(from), gestures });
	await buffers.sharing.start();
	await hostCtl.load('/w');
	shareComments(hostCtl, commentLogOf(host.doc), 'host');
	if (hostOpens) {
		textOf(host.doc, 'main.tex').observe(() => {
			hostText = textOf(host.doc, 'main.tex').toString();
			hostCtl.suggestions.textChanged(hostOpens, hostText);
		});
		hostCtl.reanchor(hostOpens, hostText);
		hostCtl.suggestions.textChanged(hostOpens, hostText);
	}

	async function joinGuest(name: string) {
		let text = '';
		let mode: 'editing' | 'suggesting' = 'editing';
		const guest = party('guest', name, {});
		const t = textOf(guest.doc, 'main.tex');
		const edit = (from: number, to: number, insert: string) => {
			guest.doc.transact(() => {
				if (to > from) t.delete(from, to - from);
				if (insert) t.insert(from, insert);
			}, EDIT_ORIGIN);
		};
		const ctl = new CommentsController({
			root: () => 'session',
			preferredAuthor: () => name,
			openFileAt: () => {},
			activeText: () => text,
			mode: () => mode,
			compares: () => false,
			applyEdit: async (e) => {
				edit(e.from, e.to, e.insert);
				return true;
			},
			saveNow: () => {}
		});
		let running = '';
		t.observe((ev) => {
			const before = running;
			text = running = t.toString();
			const from = guest.session.senderOf(ev.transaction.origin);
			if (from !== null && before)
				ctl.remoteEdit('main.tex', before, text, { ...guest.session.authorOf(from), gestures: changedSpans(ev.delta, before, text) });
			ctl.suggestions.textChanged('session/main.tex', text);
		});
		await ctl.load(null);
		await until(() => text === hostText);
		ctl.reanchor('session/main.tex', text);
		shareComments(ctl, commentLogOf(guest.doc), 'guest');
		await until(() => ctl.threads.length === hostCtl.threads.length);
		return {
			ctl,
			edit,
			text: () => text,
			/** type `words` one keystroke at a time, each just before `mark` */
			type(words: string, mark: string) {
				for (const ch of words) edit(text.indexOf(mark), text.indexOf(mark), ch);
			},
			async suggesting(on: boolean) {
				mode = on ? 'suggesting' : 'editing';
				guest.session.setSuggesting(on);
				await until(() => host.session.peers.get(guest.doc.clientID)?.suggesting === on);
			},
			close: () => guest.session.destroy()
		};
	}

	const guests: { close(): void }[] = [];
	const first = await joinGuest('mei');
	guests.push(first);

	return {
		hostCtl,
		guestCtl: first.ctl,
		guest: first,
		buffers,
		writes,
		hostText: () => hostText,
		guestText: first.text,
		guestEdit: first.edit,
		async join(name: string) {
			const g = await joinGuest(name);
			guests.push(g);
			return g;
		},
		hostEdit,
		hostOpen(path: string | null) {
			hostText = path ? disk['main.tex'] : '';
			hostCtl.reanchor(path, hostText);
		},
		close() {
			host.session.destroy();
			for (const g of guests) g.close();
			buffers.destroy();
		}
	};
}

it('records a guest rejection as rejected on the host, for replaced and for inserted words', async () => {
	const s = await connect([suggestion('s1', 'sharp', 'reliable'), suggestion('s2', 'smooth ', '')]);

	s.hostEdit('Note. ' + TEXT);
	await until(() => s.guestText() === 'Note. ' + TEXT);
	await s.guestCtl.suggestions.settle();

	const thread = (id: string) => s.guestCtl.threads.find((t) => t.id === id)!;
	expect(await s.guestCtl.suggestions.reject(thread('s1'))).toBe(true);
	await until(() => logged().some((e) => e.t === 'resolve' && e.thread === 's1' && e.decision === 'rejected'));
	await until(() => s.hostText() === 'Note. We prove the estimator is reliable for smooth solutions.\n');
	await s.hostCtl.suggestions.settle();

	expect(await s.guestCtl.suggestions.reject(thread('s2'))).toBe(true);
	await until(() => logged().some((e) => e.t === 'resolve' && e.thread === 's2' && e.decision === 'rejected'));
	await until(() => disk['main.tex'] === 'Note. We prove the estimator is reliable for solutions.\n');
	await s.hostCtl.suggestions.settle();
	await s.hostCtl.store.append();

	expect(s.hostCtl.threads.map((t) => [t.id, t.resolved, t.decision])).toEqual([
		['s1', true, 'rejected'],
		['s2', true, 'rejected']
	]);
	expect(logged().filter((e) => e.t === 'delete')).toEqual([]);
	expect(s.guestCtl.threads.map((t) => [t.id, t.decision])).toEqual([
		['s1', 'rejected'],
		['s2', 'rejected']
	]);
	s.close();
});

it('keeps a suggestion placed when a guest edits a file the host does not have open', async () => {
	const s = await connect([suggestion('s1', 'sharp', 'reliable')], null);
	await s.guestCtl.suggestions.settle();

	s.guestEdit(TEXT.indexOf('sharp'), TEXT.indexOf('sharp'), 'now ');
	const moved = TEXT.replace('is sharp', 'is now sharp');
	await until(() => disk['main.tex'] === moved);
	await until(() => logged().some((e) => e.t === 'anchor' && e.thread === 's1' && e.anchor.prefix.endsWith('is now ')));

	s.hostOpen('/w/main.tex');
	expect(s.hostCtl.orphaned.has('s1')).toBe(false);
	s.hostOpen(null);

	s.guestEdit(moved.indexOf('sharp'), moved.indexOf('sharp') + 5, 'blunt');
	await until(() => disk['main.tex'] === moved.replace('sharp', 'blunt'));
	await until(() => logged().some((e) => e.t === 'resolve' && e.thread === 's1' && e.decision === 'closed'));
	await until(() => s.guestCtl.threads[0]?.decision === 'closed');
	s.close();
});

it('carries a plain thread both ways: open, reply, resolve, edit and delete a message', async () => {
	const s = await connect([]);
	const at = TEXT.indexOf('sharp');
	const id = (await s.guestCtl.openOn('main.tex', buildAnchor(TEXT, at, at + 5), 'is this sharp?'))!;
	await until(() => s.hostCtl.threads.some((t) => t.id === id));
	const hostThread = () => s.hostCtl.threads.find((t) => t.id === id)!;
	const guestThread = () => s.guestCtl.threads.find((t) => t.id === id)!;

	const reply = (await s.hostCtl.reply(hostThread(), 'yes, sharp'))!;
	await until(() => guestThread().messages.length === 2);
	await s.guestCtl.setResolved(guestThread(), true);
	await until(() => hostThread().resolved);
	await s.hostCtl.editMessage(hostThread().messages[1], 'yes, very sharp');
	await until(() => guestThread().messages[1].body === 'yes, very sharp');
	await s.guestCtl.removeMessage(guestThread(), guestThread().messages[1]);
	await until(() => hostThread().messages.length === 1);

	const shape = (t: { id: string; file: string; resolved: boolean; messages: { id: string; by: string; body: string }[] }) => ({
		id: t.id,
		file: t.file,
		resolved: t.resolved,
		messages: t.messages.map((m) => [m.id, m.by, m.body])
	});
	expect(shape(guestThread())).toEqual(shape(hostThread()));
	expect(shape(hostThread())).toEqual({ id, file: 'main.tex', resolved: true, messages: [[id, 'mei', 'is this sharp?']] });
	expect(logged().map((e) => e.t)).toEqual(['open', 'reply', 'resolve', 'edit', 'delete-message']);
	expect(logged().some((e) => e.t === 'reply' && e.id === reply && e.by === 'louis')).toBe(true);
	s.close();
});

const openSuggestions = (s: Awaited<ReturnType<typeof connect>>) =>
	s.hostCtl.threads.filter((t) => t.restore !== undefined && !t.resolved).map((t) => [t.messages[0].by, t.anchor.quote, t.restore]);

it('records what a guest suggests under their name, and rejecting it all gives back the exact original', async () => {
	const s = await connect([]);
	await s.guest.suggesting(true);

	const at = TEXT.indexOf('sharp');
	s.guestEdit(at, at + 5, '');
	s.guest.type('blunt', ' for');
	s.guest.type('fully ', 'smooth');
	const cut = s.guestText().indexOf('We ');
	s.guestEdit(cut, cut + 3, '');
	const suggested = 'prove the estimator is blunt for fully smooth solutions.\n';
	await until(() => disk['main.tex'] === suggested);
	await s.hostCtl.suggestions.settle();
	await until(() => openSuggestions(s).length === 3);
	expect(openSuggestions(s).sort()).toEqual([
		['mei', '', 'We '],
		['mei', 'blunt', 'sharp'],
		['mei', 'fully ', '']
	]);
	await until(() => s.guestCtl.threads.filter((t) => !t.resolved).length === 3);

	for (const t of s.hostCtl.threads.filter((x) => !x.resolved)) {
		await s.hostCtl.suggestions.settle();
		expect(await s.hostCtl.suggestions.reject(t)).toBe(true);
	}
	await until(() => disk['main.tex'] === TEXT);
	await until(() => s.guestText() === TEXT);
	await s.hostCtl.store.append();
	expect(s.hostCtl.threads.map((t) => t.decision)).toEqual(['rejected', 'rejected', 'rejected']);
	await until(() => s.guestCtl.threads.every((t) => t.decision === 'rejected'));
	s.close();
});

it('keeps two guests typing in one sentence at once apart', async () => {
	const s = await connect([]);
	const ada = await s.join('ada');
	await s.guest.suggesting(true);
	await ada.suggesting(true);

	const mine = 'new ';
	const theirs = 'very ';
	for (let i = 0; i < Math.max(mine.length, theirs.length); i++) {
		if (mine[i]) s.guest.type(mine[i], 'estimator');
		if (theirs[i]) ada.type(theirs[i], 'smooth');
	}
	const both = 'We prove the new estimator is sharp for very smooth solutions.\n';
	await until(() => disk['main.tex'] === both && s.guestText() === both && ada.text() === both);
	await until(() => openSuggestions(s).length === 2);
	expect(openSuggestions(s).sort()).toEqual([
		['ada', 'very ', ''],
		['mei', 'new ', '']
	]);
	s.close();
});

it('puts what a guest suggested in the log before the file it changed', async () => {
	const s = await connect([]);
	await s.guest.suggesting(true);
	s.guest.type('new ', 'estimator');
	await until(() => disk['main.tex']?.includes('new estimator'));
	const first = s.writes.find((w) => w.tex.includes('new estimator'))!;
	expect(first.log.some((e) => e.t === 'open' && e.by === 'mei' && e.anchor.quote === 'new ')).toBe(true);
	s.close();
});
