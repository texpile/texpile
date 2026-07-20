// Headless end-to-end: real Y.Docs + real AES-GCM sealing over an in-process fake relay that
// mimics the real one (blind broadcast, optional chaos). This is where convergence is proven.
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { deriveSessionKeys } from '$lib/collab/e2e/keys';
import { generateShareCode } from '$lib/collab/e2e/shareCode';
import type { RelayNotice } from '$lib/collab/protocol';
import type { Transport, TransportStatus } from '$lib/collab/transport';
import { CollabSession, manifestOf, locksOf, textOf } from '$lib/collab/session';
import { HostMaterializer, spliceDiff, isShared, isTextFile } from '$lib/collab/materialize';

class FakeHub {
	transports = new Set<FakeTransport>();
	/** random extra delay per delivery, to shake out ordering assumptions. */
	chaosMs = 0;
	deliver(from: FakeTransport, data: Uint8Array): void {
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
	send(data: Uint8Array): void {
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
}
function fakeFs(files: Record<string, string>) {
	const disk = new Map<string, FakeFsFile>(Object.entries(files).map(([rel, content]) => [rel, { content }]));
	return {
		disk,
		fs: {
			readText: async (p: string) => {
				const f = disk.get(p.replace(/^root\//, ''));
				if (!f) throw new Error('missing ' + p);
				return f.content;
			},
			writeText: async (p: string, content: string) => {
				disk.set(p.replace(/^root\//, ''), { content });
			},
			listFiles: async () => [...disk.entries()].map(([rel, f]) => ({ rel, size: f.content.length }))
		}
	};
}
const join = (root: string, rel: string) => `${root}/${rel}`;

async function makeParty(hub: FakeHub, role: 'host' | 'guest', name: string, key: CryptoKey) {
	const doc = new Y.Doc();
	const transport = new FakeTransport(hub, role);
	const events: { ended?: string; blobs: { name: string; rev: number; bytes: Uint8Array }[] } = { blobs: [] };
	const session = new CollabSession({
		doc,
		transport,
		key,
		role,
		user: { name, color: '#123456' },
		events: {
			onSessionEnd: (reason) => (events.ended = reason),
			onBlob: (name_, rev, bytes) => events.blobs.push({ name: name_, rev, bytes })
		}
	});
	transport.start();
	return { doc, session, transport, events };
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
	it('classifies text vs artifact vs binary paths', () => {
		expect(isShared('main.tex') && isTextFile('main.tex')).toBe(true);
		expect(isShared('refs.bib') && isTextFile('refs.bib')).toBe(true);
		expect(isShared('fig/plot.png')).toBe(true);
		expect(isTextFile('fig/plot.png')).toBe(false);
		for (const p of ['main.aux', 'main.log', 'main.synctex.gz', 'output/main.pdf', '.git/config', 'a/output/x.tex']) {
			expect(isShared(p)).toBe(false);
		}
	});
});

describe('collab session end-to-end', () => {
	it('seeds, syncs to a guest, and converges concurrent edits through to disk', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { disk, fs } = fakeFs({ 'main.tex': 'Hello\nWorld\n', 'refs.bib': '@book{k, title={T}}\n' });

		const host = await makeParty(hub, 'host', 'Host', key);
		const mat = new HostMaterializer(host.doc, 'root', fs, join);
		await mat.seed();

		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'Hello\nWorld\n');
		expect(manifestOf(guest.doc).get('refs.bib')?.kind).toBe('text');

		// guest edits the top, host edits the bottom (via its editor-save path), concurrently
		textOf(guest.doc, 'main.tex').insert(0, 'G: ');
		mat.hostEdit('main.tex', 'Hello\nWorld\nH-line\n');
		await until(() => {
			const a = textOf(guest.doc, 'main.tex').toString();
			return a === textOf(host.doc, 'main.tex').toString() && a.includes('G: ') && a.includes('H-line');
		});
		// the merged result lands on disk (guest edit written by the materializer)
		await until(() => disk.get('main.tex')!.content.includes('G: ') && disk.get('main.tex')!.content.includes('H-line'));

		mat.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	it('converges under chaotic delivery and syncs a late joiner fully', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		hub.chaosMs = 15;
		const { fs } = fakeFs({ 'main.tex': 'base\n' });
		const host = await makeParty(hub, 'host', 'Host', key);
		const mat = new HostMaterializer(host.doc, 'root', fs, join);
		await mat.seed();
		const g1 = await makeParty(hub, 'guest', 'G1', key);
		await until(() => textOf(g1.doc, 'main.tex').toString() === 'base\n');

		for (let i = 0; i < 10; i++) {
			textOf(g1.doc, 'main.tex').insert(0, `g${i} `);
			mat.hostEdit('main.tex', textOf(host.doc, 'main.tex').toString() + `h${i} `);
			await new Promise((r) => setTimeout(r, 5));
		}
		await until(() => textOf(g1.doc, 'main.tex').toString() === textOf(host.doc, 'main.tex').toString());

		// late joiner sees the exact converged state
		const g2 = await makeParty(hub, 'guest', 'G2', key);
		await until(() => textOf(g2.doc, 'main.tex').toString() === textOf(host.doc, 'main.tex').toString());
		const final = textOf(host.doc, 'main.tex').toString();
		for (let i = 0; i < 10; i++) expect(final).toContain(`g${i}`);
		for (let i = 0; i < 10; i++) expect(final).toContain(`h${i}`);

		mat.destroy();
		for (const p of [host, g1, g2]) p.session.destroy();
	});

	it('preserves CRLF on write-back while sharing LF internally', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { disk, fs } = fakeFs({ 'win.tex': 'a\r\nb\r\n' });
		const host = await makeParty(hub, 'host', 'Host', key);
		const mat = new HostMaterializer(host.doc, 'root', fs, join);
		await mat.seed();
		expect(textOf(host.doc, 'win.tex').toString()).toBe('a\nb\n');
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'win.tex').toString() === 'a\nb\n');
		textOf(guest.doc, 'win.tex').insert(2, 'x\n');
		await until(() => disk.get('win.tex')!.content === 'a\r\nx\r\nb\r\n');
		mat.destroy();
		host.session.destroy();
		guest.session.destroy();
	});

	it('propagates locks, blobs, and session-end', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'x' });
		const host = await makeParty(hub, 'host', 'Host', key);
		const mat = new HostMaterializer(host.doc, 'root', fs, join);
		await mat.seed();
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => manifestOf(guest.doc).has('main.tex'));

		mat.setHostLock('main.tex');
		await until(() => locksOf(guest.doc).get('main.tex') === host.doc.clientID);
		mat.setHostLock(null, 'main.tex');
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
		mat.destroy();
	});

	it('ignores a guest forging host-authoritative frames (session-end, PDF blob)', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'x' });
		const host = await makeParty(hub, 'host', 'Host', key);
		const mat = new HostMaterializer(host.doc, 'root', fs, join);
		await mat.seed();
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
		mat.destroy();
	});

	it('a reconnect re-handshake heals a gap in delivery', async () => {
		const key = (await deriveSessionKeys(generateShareCode())).contentKey;
		const hub = new FakeHub();
		const { fs } = fakeFs({ 'main.tex': 'base' });
		const host = await makeParty(hub, 'host', 'Host', key);
		const mat = new HostMaterializer(host.doc, 'root', fs, join);
		await mat.seed();
		const guest = await makeParty(hub, 'guest', 'Guest', key);
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'base');

		// sever the guest, let the host edit meanwhile, then "reconnect"
		hub.transports.delete(guest.transport);
		mat.hostEdit('main.tex', 'base + offline host edit');
		await new Promise((r) => setTimeout(r, 50));
		expect(textOf(guest.doc, 'main.tex').toString()).toBe('base');
		hub.transports.add(guest.transport);
		(guest.transport.onStatus as (s: TransportStatus) => void)('connected'); // what RelayTransport does on reopen
		await until(() => textOf(guest.doc, 'main.tex').toString() === 'base + offline host edit');

		mat.destroy();
		host.session.destroy();
		guest.session.destroy();
	});
});
