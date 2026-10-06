// Headless end-to-end: real Y.Docs + real AES-GCM sealing over an in-process fake relay that
// mimics the real one (blind broadcast, optional chaos). This is where convergence is proven.
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { deriveSessionKeys } from '$lib/collab/e2e/keys';
import { generateShareCode } from '$lib/collab/e2e/shareCode';
import { BROADCAST, FrameType, decodeFrame, encodeFrame, type Frame, type RelayNotice } from '$lib/collab/protocol';
import { seal, unseal } from '$lib/collab/e2e/seal';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import type { Transport, TransportStatus } from '$lib/collab/transport';
import { CollabSession, manifestOf, locksOf, textOf } from '$lib/collab/session';
import type { SessionVersion } from '$lib/collab/compatibility';
import { isShared, isGeneratedArtifact, decodeIfText, EDIT_ORIGIN } from '$lib/collab/sharedFiles';
import { TextBuffers, type TextBuffersFs } from '$lib/buffers/textBuffers';
import { spliceDiff } from '$lib/collab/spliceDiff';

class FakeHub {
	transports = new Set<FakeTransport>();
	/** random extra delay per delivery, to shake out ordering assumptions. */
	chaosMs = 0;
	/** frames the relay has been handed */
	sent = 0;
	deliver(from: FakeTransport, data: Uint8Array): void {
		this.sent++;
		// mirror the real relay: stamp the sender's origin role so receivers get fromHost
		const fromHost = from.role === 'host';
		for (const t of this.transports) {
			if (t === from || t.closed) continue;
			const delay = this.chaosMs > 0 ? Math.random() * this.chaosMs : 0;
			setTimeout(() => t.onMessage?.(data, fromHost), delay);
		}
	}
}

class FakeTransport implements Transport {
	onMessage: ((data: Uint8Array, fromHost: boolean) => void) | null = null;
	onNotice: ((n: RelayNotice) => void) | null = null;
	onStatus: ((s: TransportStatus, detail?: string) => void) | null = null;
	closed = false;
	constructor(
		private hub: FakeHub,
		readonly role: 'host' | 'guest' = 'guest'
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

const until = async (cond: () => boolean, ms = 4000): Promise<void> => {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > ms) throw new Error('condition not reached in time');
		await new Promise((r) => setTimeout(r, 10));
	}
};

interface FakeFsFile {
	content: string;
	/** binaries only, mirroring the real host: it stats them so a replaced file gets a new rev */
	mtimeMs?: number;
}
function fakeFs(files: Record<string, string>) {
	const disk = new Map<string, FakeFsFile>(Object.entries(files).map(([rel, content]) => [rel, { content }]));
	return {
		disk,
		fs: {
			readBytes: async (p: string) => {
				const f = disk.get(p.replace(/^root\//, ''));
				if (!f) throw new Error('missing ' + p);
				return new TextEncoder().encode(f.content);
			},
			writeText: async (p: string, content: string) => {
				disk.set(p.replace(/^root\//, ''), { content });
			},
			listFiles: async () => [...disk.entries()].map(([rel, f]) => ({ rel, size: f.content.length, mtimeMs: f.mtimeMs }))
		}
	};
}
const join = (root: string, rel: string) => `${root}/${rel}`;

async function makeParty(
	hub: FakeHub,
	role: 'host' | 'guest',
	name: string,
	key: CryptoKey,
	version?: SessionVersion,
	buffers?: TextBuffers
) {
	const doc = buffers?.shared ?? new Y.Doc();
	const transport = new FakeTransport(hub, role);
	const events: { ended?: string; endedDetail?: string; blobs: { name: string; rev: number; bytes: Uint8Array }[] } = { blobs: [] };
	const session = new CollabSession({
		doc,
		awareness: buffers?.awareness,
		transport,
		key,
		role,
		user: { name, color: '#123456' },
		version,
		events: {
			onSessionEnd: (reason, detail) => {
				events.ended = reason;
				events.endedDetail = detail;
			},
			onBlob: (name_, rev, bytes) => events.blobs.push({ name: name_, rev, bytes })
		}
	});
	transport.start();
	return { doc, session, transport, events };
}

/** the host as hostStore starts it: the session on the folder's buffers, then the files shared */
async function makeHost(hub: FakeHub, key: CryptoKey, fs: TextBuffersFs, version?: SessionVersion) {
	const buffers = new TextBuffers('root', fs, join);
	const party = await makeParty(hub, 'host', 'Host', key, version, buffers);
	const { oversizedText } = await buffers.sharing.start();
	return { ...party, buffers, oversizedText };
}

describe('spliceDiff', () => {
	it('produces minimal splices and survives the overlap pitfalls', () => {
		expect(spliceDiff('same', 'same')).toBeNull();
		expect(spliceDiff('hello world', 'hello brave world')).toEqual({ index: 6, remove: 0, insert: 'brave ' });
		expect(spliceDiff('aaa', 'aa')).toEqual({ index: 2, remove: 1, insert: '' });
		expect(spliceDiff('abab', 'ab')).toEqual({ index: 2, remove: 2, insert: '' });
		expect(spliceDiff('', 'x')).toEqual({ index: 0, remove: 0, insert: 'x' });
		// applying the splice always reproduces the target
		for (const [a, b] of [
			['abcdef', 'abXYef'],
			['aa', 'aaa'],
			['xyx', 'xx'],
			['\\section{A}\nBody', '\\section{A}\nNew body']
		]) {
			const d = spliceDiff(a, b);
			const applied = d ? a.slice(0, d.index) + d.insert + a.slice(d.index + d.remove) : a;
			expect(applied).toBe(b);
		}
	});
});

describe('sharing filters', () => {
	// Co-edit is decided by CONTENT, not extension: an allow-list regressed once (.typ was missing
	// for the whole life of typst support, locking guests out of every typst file). The only
	// name-based judgements left are the generated-artifact denylist and the VCS/deps exclusion.
	it('classifies text by content: lossless UTF-8 in, NULs and invalid bytes out', () => {
		expect(decodeIfText(new TextEncoder().encode('\\section{A}\nplain text'))).toBe('\\section{A}\nplain text');
		expect(decodeIfText(new TextEncoder().encode('unicode: naïve 日本語'))).toBe('unicode: naïve 日本語');
		expect(decodeIfText(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]))).toBeNull(); // PNG-ish: NUL
		expect(decodeIfText(new Uint8Array([0xc3, 0x28]))).toBeNull(); // invalid UTF-8 sequence
	});

	it('keeps compile artifacts out of the CRDT, hides only VCS, deps and hidden files', () => {
		for (const p of ['main.log', 'output/main.aux', 'main.synctex.gz', 'main.fdb_latexmk', 'main.bbl']) {
			expect(isShared(p), p).toBe(true); // still fetchable as bytes
			expect(isGeneratedArtifact(p), p).toBe(true); // never co-edited
		}
		for (const p of ['main.tex', 'refs.bib', 'typst/main.typ', 'chapters/01-basics.typ', 'fig/plot.png']) {
			expect(isGeneratedArtifact(p), p).toBe(false);
		}
		for (const p of ['.git/config', '.svn/entries', 'node_modules/x/index.js', '__pycache__/y.pyc', '.env', 'sub/.texpile/config.json']) {
			expect(isShared(p), p).toBe(false);
		}
	});

	it('shares only what the host listed, whatever a guest writes into the manifest', async () => {
		const buffers = new TextBuffers('root', fakeFs({ 'main.tex': 'x', 'figures/plot.png': 'png' }).fs, join);
		await buffers.sharing.start();
		manifestOf(buffers.shared).set('.texpile/config.json', { kind: 'binary', size: 1, rev: 0 });
		expect(buffers.sharing.sharesFile('main.tex')).toBe(true);
		expect(buffers.sharing.sharesFolder('figures')).toBe(true);
		expect(buffers.sharing.sharesFile('.texpile/config.json')).toBe(false);
		expect(buffers.sharing.sharesFolder('.texpile')).toBe(false);
		buffers.destroy();
	});

	it('leaves hidden files out of the manifest', async () => {
		const files = { 'main.tex': 'x', '.env': 'TOKEN=1', 'sub/.npmrc': '//registry/:_authToken=1', '.latexmkrc': '$pdf_mode = 1;' };
		const buffers = new TextBuffers('root', fakeFs(files).fs, join);
		await buffers.sharing.start();
		expect([...manifestOf(buffers.shared).keys()]).toEqual(['main.tex']);
		buffers.destroy();
	});
});

describe('collab session end-to-end', () => {
	it('seeds, syncs to a guest, and converges concurrent edits through to disk', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { disk, fs } = fakeFs({ 'main.tex': 'Hello\nWorld\n', 'refs.bib': '@book{k, title={T}}\n' });

		const host = await makeHost(hub, key, fs);

		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'Hello\nWorld\n');
		expect(manifestOf(guest.doc).get('refs.bib')?.kind).toBe('text');

		// guest edits the top, host edits the bottom (an editor folding its change in), concurrently
		textOf(guest.doc, 'main.tex').insert(0, 'G: ');
		host.buffers.fold('main.tex', 'Hello\nWorld\nH-line\n');
		await until(() => {
			const a = textOf(guest.doc, 'main.tex').toString();
			return a === textOf(host.doc, 'main.tex').toString() && a.includes('G: ') && a.includes('H-line');
		});
		// the merged result lands on disk, the host's own edit through the same writer as the guest's
		await host.buffers.flushAll();
		expect(disk.get('main.tex')!.content).toBe(textOf(host.doc, 'main.tex').toString());

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	it('goes quiet once a guest has joined and both sides have caught up', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const host = await makeParty(hub, 'host', 'Host', key);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => host.session.peers.size === 1 && guest.session.peers.size === 1);
		await new Promise((r) => setTimeout(r, 200));
		const settled = hub.sent;
		await new Promise((r) => setTimeout(r, 500));
		expect(hub.sent - settled).toBe(0);

		host.session.destroy();
		guest.session.destroy();
	});

	it("shows a guest who joins later the host's presence at once, not at the next awareness renewal", async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const host = await makeParty(hub, 'host', 'Host', key);
		host.session.setSuggesting(true);
		await new Promise((r) => setTimeout(r, 100));
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => [...guest.session.peers.values()].some((p) => p.role === 'host' && p.suggesting === true), 1000);

		host.session.destroy();
		guest.session.destroy();
	});

	it('carries a renamed profile to the peers of a running session', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const host = await makeParty(hub, 'host', 'Host', key);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => [...guest.session.peers.values()].some((p) => p.name === 'Host'));

		host.session.setIdentity({ name: 'Mei', color: '#059669' });
		await until(() => [...guest.session.peers.values()].some((p) => p.name === 'Mei' && p.color === '#059669'));
		expect([...guest.session.peers.values()].find((p) => p.name === 'Mei')?.role).toBe('host');

		host.session.destroy();
		guest.session.destroy();
	});

	it('syncs a large text file whose raw sync frame would blow the relay cap', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		// ~1.5 MB of repetitive LaTeX: far over the ~900 KB per-frame cap raw, but it gzips tiny, so
		// the full-state frame a joining guest gets only clears the relay because compression runs
		// before seal. This is the arXiv-monolith case that used to loop on "reconnecting".
		const big = '\\section{Body}\nSome repeated paragraph text for the corpus.\n'.repeat(26000);
		expect(big.length).toBeGreaterThan(1_000_000);
		const { fs } = fakeFs({ 'main.tex': big });

		const host = await makeHost(hub, key, fs);
		expect(host.oversizedText).toEqual([]); // under the 2 MiB co-edit cap, so still co-edited, not view-only

		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === big);

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	// the visual editors' fold-in contract on both sides: a local splice carries EDIT_ORIGIN (so
	// the editor's own Y.Text observer can filter it), while the far side receives it under a
	// different origin (so its remote re-parse observer fires) and the edit still lands on disk
	it('tags fold-in splices EDIT_ORIGIN locally, a different origin remotely', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { disk, fs } = fakeFs({ 'main.tex': 'Hello\n' });

		const host = await makeHost(hub, key, fs);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'Hello\n');

		const localOrigins: unknown[] = [];
		const remoteOrigins: unknown[] = [];
		textOf(guest.doc, 'main.tex').observe((ev) => localOrigins.push(ev.transaction.origin));
		textOf(host.doc, 'main.tex').observe((ev) => remoteOrigins.push(ev.transaction.origin));

		// guestSession.edit's body: minimal splice under EDIT_ORIGIN
		const t = textOf(guest.doc, 'main.tex');
		const diff = spliceDiff(t.toString(), 'Hello\nGuest line\n')!;
		guest.doc.transact(() => {
			if (diff.remove > 0) t.delete(diff.index, diff.remove);
			if (diff.insert) t.insert(diff.index, diff.insert);
		}, EDIT_ORIGIN);

		await until(() => textOf(host.doc, 'main.tex').toString() === 'Hello\nGuest line\n');
		expect(localOrigins).toEqual([EDIT_ORIGIN]);
		expect(remoteOrigins.length).toBeGreaterThan(0);
		expect(remoteOrigins.every((o) => o !== EDIT_ORIGIN)).toBe(true);
		await host.buffers.flushAll();
		expect(disk.get('main.tex')!.content).toBe('Hello\nGuest line\n');

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	// a guest's file tree is rebuilt off the manifest, so a file the host adds mid-session has to
	// reach the manifest for it to ever appear. WorkspaceView drives the redraw off provider.watch.
	it('propagates files the host adds and removes after the session started', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { disk, fs } = fakeFs({ 'main.tex': 'Hello\n' });

		const host = await makeHost(hub, key, fs);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => manifestOf(guest.doc).has('main.tex'));
		expect(manifestOf(guest.doc).has('chapters/intro.tex')).toBe(false);

		// host creates a file, then re-syncs the tree (WorkspaceView's refreshTree does this)
		disk.set('chapters/intro.tex', { content: 'Intro\n' });
		await host.buffers.sharing.syncFromTree();
		await until(() => textOf(guest.doc, 'chapters/intro.tex').toString() === 'Intro\n');
		expect(manifestOf(guest.doc).get('chapters/intro.tex')?.kind).toBe('text');

		// and a deletion is tombstoned, not silently left behind
		disk.delete('chapters/intro.tex');
		await host.buffers.sharing.syncFromTree();
		await until(() => manifestOf(guest.doc).get('chapters/intro.tex')?.gone === true);

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	// a replaced image keeps its path, so only the manifest rev can tell a guest its cached blob
	// is stale. Without it the guest caches by path and never refetches for the whole session.
	it('bumps a binary rev when the host replaces the file, so a guest can drop its cached copy', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { disk, fs } = fakeFs({ 'main.tex': 'Hi\n' });
		// the NUL is what makes it binary now that classification sniffs content, not extension
		disk.set('fig.png', { content: 'PNG\u0000v1', mtimeMs: 1000 });

		const host = await makeHost(hub, key, fs);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => manifestOf(guest.doc).get('fig.png')?.kind === 'binary');
		expect(manifestOf(guest.doc).get('fig.png')?.rev).toBe(1000);

		// same path, new bytes: the rev has to move or the guest keeps showing the old image
		disk.set('fig.png', { content: 'PNG\u0000v2', mtimeMs: 2000 });
		await host.buffers.sharing.syncFromTree();
		await until(() => manifestOf(guest.doc).get('fig.png')?.rev === 2000);
		// text is unaffected: its edits ride the CRDT, so it carries no rev
		expect(manifestOf(guest.doc).get('main.tex')?.rev).toBeUndefined();

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	it('converges under chaotic delivery and syncs a late joiner fully', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		hub.chaosMs = 15;
		const { fs } = fakeFs({ 'main.tex': 'base\n' });
		const host = await makeHost(hub, key, fs);
		const g1 = await makeParty(hub, 'guest', 'G1', key);
		await until(() => textOf(g1.doc, 'main.tex').toString() === 'base\n');

		for (let i = 0; i < 10; i++) {
			textOf(g1.doc, 'main.tex').insert(0, `g${i} `);
			host.buffers.fold('main.tex', textOf(host.doc, 'main.tex').toString() + `h${i} `);
			await new Promise((r) => setTimeout(r, 5));
		}
		await until(() => textOf(g1.doc, 'main.tex').toString() === textOf(host.doc, 'main.tex').toString());

		// late joiner sees the exact converged state
		const g2 = await makeParty(hub, 'guest', 'G2', key);
		await until(() => textOf(g2.doc, 'main.tex').toString() === textOf(host.doc, 'main.tex').toString());
		const final = textOf(host.doc, 'main.tex').toString();
		for (let i = 0; i < 10; i++) expect(final).toContain(`g${i}`);
		for (let i = 0; i < 10; i++) expect(final).toContain(`h${i}`);

		host.buffers.destroy();
		for (const p of [host, g1, g2]) p.session.destroy();
	});

	it("keeps a guest's words the host's editor has not taken in yet when the host types", async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const shown = 'one two three\n\nfour five six\n';
		const { fs } = fakeFs({ 'main.tex': shown });
		const host = await makeHost(hub, key, fs);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === shown);

		textOf(guest.doc, 'main.tex').insert(3, ' GUEST');
		await until(() => textOf(host.doc, 'main.tex').toString().includes('GUEST'));
		// keystrokes from the text the host's visual editor still shows, before its re-parse lands
		let before = shown;
		for (const word of [' H1', ' H2']) {
			const next = before.slice(0, -1) + word + '\n';
			host.buffers.fold('main.tex', next, before);
			before = next;
		}
		await until(() => textOf(guest.doc, 'main.tex').toString().includes('H2'));
		expect(textOf(host.doc, 'main.tex').toString()).toBe('one GUEST two three\n\nfour five six H1 H2\n');
		expect(textOf(guest.doc, 'main.tex').toString()).toBe(textOf(host.doc, 'main.tex').toString());

		// the re-parse lands, then the host types again
		const adopted = textOf(host.doc, 'main.tex').toString();
		host.buffers.fold('main.tex', adopted);
		host.buffers.fold('main.tex', adopted.replace('one', 'one!'), adopted);
		expect(textOf(host.doc, 'main.tex').toString()).toBe('one! GUEST two three\n\nfour five six H1 H2\n');

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	it('preserves CRLF on write-back while sharing LF internally', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { disk, fs } = fakeFs({ 'win.tex': 'a\r\nb\r\n' });
		const host = await makeHost(hub, key, fs);
		const stamps: string[] = [];
		host.buffers.hooks.recordStamp = async (p) => void stamps.push(p);
		expect(textOf(host.doc, 'win.tex').toString()).toBe('a\nb\n');
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'win.tex').toString() === 'a\nb\n');
		textOf(guest.doc, 'win.tex').insert(2, 'x\n');
		await until(() => host.buffers.hasPending('win.tex'));
		await host.buffers.flushAll();
		expect(disk.get('win.tex')!.content).toBe('a\r\nx\r\nb\r\n');
		// what it wrote is known as of the write, so the host's check for outside changes passes it by
		expect(host.buffers.baselineOf('win.tex')).toBe('a\nx\nb\n');
		expect(stamps).toEqual(['root/win.tex']);
		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	it('keeps the endings of the lines an edit left alone in a file that mixes them', async () => {
		const { disk, fs } = fakeFs({ 'mixed.tex': 'a\r\nb\nc\r\n' });
		const buffers = new TextBuffers('root', fs, join);
		(await buffers.ensure('mixed.tex'))!.insert(2, 'x\n');
		await buffers.flushAll();
		expect(disk.get('mixed.tex')!.content).toBe('a\r\nx\r\nb\nc\r\n');
		buffers.destroy();
	});

	it('propagates locks, blobs, and session-end', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'x' });
		const host = await makeHost(hub, key, fs);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => manifestOf(guest.doc).has('main.tex'));

		host.buffers.sharing.setHostLock('main.tex');
		await until(() => locksOf(guest.doc).get('main.tex') === host.doc.clientID);
		host.buffers.sharing.setHostLock(null, 'main.tex');
		await until(() => !locksOf(guest.doc).has('main.tex'));

		// blob transfer: guest asks, host answers, chunks reassemble
		const pdf = new Uint8Array(300 * 1024).map((_, i) => i % 256);
		await until(() => host.session.peers.size > 0 && guest.session.hostId !== null);
		const hostEvents = host.session as unknown as { events: { onBlobRequest?: (name: string, from: number) => void } };
		hostEvents.events.onBlobRequest = (name, from) => host.session.sendBlob(name, 3, pdf, from);
		guest.session.requestBlob('pdf');
		await until(() => guest.events.blobs.length > 0);
		expect(guest.events.blobs[0].rev).toBe(3);
		expect(guest.events.blobs[0].bytes).toEqual(pdf);

		host.session.endForEveryone();
		await until(() => guest.events.ended === 'host-ended');
		host.buffers.destroy();
	});

	it('ignores a guest forging host-authoritative frames (session-end, PDF blob)', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'x' });
		const host = await makeHost(hub, key, fs);
		const victim = await makeParty(hub, 'guest', 'Victim', key);
		const attacker = await makeParty(hub, 'guest', 'Attacker', key);
		await until(() => manifestOf(victim.doc).has('main.tex') && manifestOf(attacker.doc).has('main.tex'));

		// attacker (a legitimate keyholder) forges a session-end and a poisoned PDF blob
		attacker.session.sendControl({ kind: 'session-end' });
		attacker.session.sendBlob('pdf', 99, new Uint8Array([1, 2, 3]), 0);
		await new Promise((r) => setTimeout(r, 120));
		// guest-origin frames are dropped: nobody ended, no PDF was accepted
		expect(victim.events.ended).toBeUndefined();
		expect(host.events.ended).toBeUndefined();
		expect(victim.events.blobs.length).toBe(0);
		// the attacker is not seen as the host by anyone
		expect(victim.session.hostId).toBe(host.doc.clientID);

		// but the real host CAN end it
		host.session.endForEveryone();
		await until(() => victim.events.ended === 'host-ended');
		host.buffers.destroy();
	});

	it('turns away a guest on a version the host cannot share with, and tells a guest its host is outdated', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs, disk } = fakeFs({ 'main.tex': 'shared' });
		const host = await makeHost(hub, key, fs, { version: '1.3.0', oldest: '1.3.0' });
		const current = await makeParty(hub, 'guest', 'Current', key, { version: '1.3.0', oldest: '1.3.0' });
		await until(() => manifestOf(current.doc).has('main.tex'));

		// a build from before the check: a HELLO without a version, then an edit
		const legacy = new FakeTransport(hub, 'guest');
		const legacyDoc = new Y.Doc();
		const received: Frame[] = [];
		const send = async (frame: Frame) => legacy.send(await seal(key, Uint8Array.of(0, ...encodeFrame(frame))));
		legacy.onMessage = (data) => void unseal(key, data).then((plain) => received.push(decodeFrame(plain.subarray(1))));
		legacy.start();
		await send({
			type: FrameType.HELLO,
			from: legacyDoc.clientID,
			to: BROADCAST,
			payload: { name: 'Legacy', color: '#654321', role: 'guest' }
		});
		legacyDoc.getText('f:main.tex').insert(0, 'stale ');
		const update = encoding.createEncoder();
		syncProtocol.writeUpdate(update, Y.encodeStateAsUpdate(legacyDoc));
		await send({ type: FrameType.SYNC, from: legacyDoc.clientID, to: BROADCAST, payload: encoding.toUint8Array(update) });
		await until(() =>
			received.some((f) => f.type === FrameType.CONTROL && f.to === legacyDoc.clientID && f.payload.kind === 'session-end')
		);
		await new Promise((r) => setTimeout(r, 60));
		expect(textOf(host.doc, 'main.tex').toString()).toBe('shared');

		const older = await makeParty(hub, 'guest', 'Older', key, { version: '1.2.0', oldest: '1.1.0' });
		await until(() => older.events.ended !== undefined);
		expect([older.events.ended, older.events.endedDetail]).toEqual(['app-outdated', '1.3.0']);
		expect([...host.session.peers.values()].map((p) => p.name)).toEqual(['Current']);

		const hub2 = new FakeHub();
		const oldHost = await makeParty(hub2, 'host', 'Old host', key, { version: '1.2.0', oldest: '1.1.0' });
		const newGuest = await makeParty(hub2, 'guest', 'New guest', key, { version: '1.3.0', oldest: '1.3.0' });
		await until(() => newGuest.events.ended !== undefined);
		expect([newGuest.events.ended, newGuest.events.endedDetail]).toEqual(['host-outdated', '1.2.0']);
		expect(disk.get('main.tex')?.content).toBe('shared');
		host.buffers.destroy();
		oldHost.session.destroy();
	});

	it('turns away a guest that cannot share a session with a guest already in it, whichever joins second', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hostVersion = { version: '1.3.0', oldest: '1.2.0' };
		const older = { version: '1.2.0', oldest: '1.2.0' };
		const newer = { version: '1.4.0', oldest: '1.3.0' };

		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'base' });
		const host = await makeHost(hub, key, fs, hostVersion);
		const a = await makeParty(hub, 'guest', 'A', key, older);
		await until(() => textOf(a.doc, 'main.tex').toString() === 'base' && host.session.peers.has(a.doc.clientID));
		const b = await makeParty(hub, 'guest', 'B', key, newer);
		await until(() => b.events.ended !== undefined);
		// the host itself takes B: what B cannot share with is a guest, and B says so rather than blame the host
		expect([b.events.ended, b.events.endedDetail]).toEqual(['guest-outdated', '1.2.0']);
		// one that takes both still joins, and the rest keep editing together
		const c = await makeParty(hub, 'guest', 'C', key, hostVersion);
		await until(() => textOf(c.doc, 'main.tex').toString() === 'base');
		textOf(a.doc, 'main.tex').insert(4, ' from A');
		textOf(c.doc, 'main.tex').insert(0, 'C: ');
		await until(() => [host, a, c].every((p) => textOf(p.doc, 'main.tex').toString() === 'C: base from A'));
		expect(a.events.ended).toBeUndefined();
		expect(c.events.ended).toBeUndefined();
		expect([...host.session.peers.values()].map((p) => p.name).sort()).toEqual(['A', 'C']);
		host.buffers.destroy();
		for (const p of [host, a, c]) p.session.destroy();

		const hub2 = new FakeHub();
		const host2 = await makeHost(hub2, key, fakeFs({ 'main.tex': 'base' }).fs, hostVersion);
		const b2 = await makeParty(hub2, 'guest', 'B', key, newer);
		await until(() => textOf(b2.doc, 'main.tex').toString() === 'base' && host2.session.peers.has(b2.doc.clientID));
		const a2 = await makeParty(hub2, 'guest', 'A', key, older);
		await until(() => a2.events.ended !== undefined);
		expect([a2.events.ended, a2.events.endedDetail]).toEqual(['app-outdated', '1.3.0']);
		expect(b2.events.ended).toBeUndefined();
		host2.buffers.destroy();
		for (const p of [host2, b2]) p.session.destroy();
	});

	it('a reconnect re-handshake heals a gap in delivery', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'base' });
		const host = await makeHost(hub, key, fs);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'base');

		// sever the guest, let the host edit meanwhile, then "reconnect"
		hub.transports.delete(guest.transport);
		host.buffers.fold('main.tex', 'base + offline host edit');
		await new Promise((r) => setTimeout(r, 50));
		expect(textOf(guest.doc, 'main.tex').toString()).toBe('base');
		hub.transports.add(guest.transport);
		(guest.transport.onStatus as (s: TransportStatus) => void)('connected'); // what RelayTransport does on reopen
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'base + offline host edit');

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	it('counts only the first sync after its own reconnect as a catch-up, not a guest who comes back later', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'one two three' });
		const host = await makeHost(hub, key, fs);
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'one two three' && host.session.peers.has(guest.doc.clientID));
		const modes: string[] = [];
		textOf(host.doc, 'main.tex').observe((ev) => {
			const from = host.session.senderOf(ev.transaction.origin);
			if (from !== null) modes.push(host.session.authorOf(from).mode);
		});
		function away(t: FakeTransport) {
			t.closed = true;
			hub.transports.delete(t);
		}
		function back(t: FakeTransport) {
			t.closed = false;
			hub.transports.add(t);
			(t.onStatus as (s: TransportStatus) => void)('connected');
		}

		// the host drops off while the guest edits: its catch-up says nothing of who did what
		away(host.transport);
		textOf(guest.doc, 'main.tex').delete(0, 4);
		await new Promise((r) => setTimeout(r, 50));
		back(host.transport);
		await until(() => textOf(host.doc, 'main.tex').toString() === 'two three');
		await new Promise((r) => setTimeout(r, 50));

		// later the guest, editing, drops off and comes back with an edit of its own
		away(guest.transport);
		textOf(guest.doc, 'main.tex').delete(3, 6);
		await new Promise((r) => setTimeout(r, 50));
		expect(textOf(host.doc, 'main.tex').toString()).toBe('two three');
		back(guest.transport);
		await until(() => textOf(host.doc, 'main.tex').toString() === 'two');
		expect(modes).toEqual(['suggesting', 'editing']);

		host.buffers.destroy();
		host.session.destroy();
		guest.session.destroy();
	});
});
