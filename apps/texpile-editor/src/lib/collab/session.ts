// The E2EE session engine: one Y.Doc + awareness synced over a blind relay. Framework-agnostic
// (no Svelte, no fs) so the whole thing runs headless in tests; the host's file glue lives in
// materialize.ts and the UI glue in the views.
//
// Topology: every sealed frame is broadcast by the relay; addressing lives inside the ciphertext
// (to=0 broadcast, else a Y clientID) and receivers drop frames not meant for them. Sync is
// star-shaped in practice — guests handshake with the host — but incremental updates broadcast
// to everyone, and Yjs idempotence makes duplicate delivery harmless.

import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { seal, open } from './e2e/seal';
import { gzip, gunzip } from './compress';
import {
	FrameType,
	BROADCAST,
	encodeFrame,
	decodeFrame,
	chunkBlob,
	BlobAssembler,
	type Frame,
	type ControlPayload,
	type RelayNotice
} from './protocol';
import type { Transport, TransportStatus } from './transport';

export interface PeerInfo {
	name: string;
	color: string;
	role: 'host' | 'guest';
}

export type SessionEndReason = 'host-ended' | 'relay-closed' | 'quota' | 'error' | 'no-session' | 'full';

// the relay drops any WebSocket message over 1 MiB, which would crash the session into a reconnect
// loop; stay under it with margin for the seal nonce/tag and the codec byte. Frames still over this
// after gzip (a pathologically large or incompressible doc) are dropped, not sent: a degraded
// session (a file that won't sync) beats a socket that keeps dying.
const MAX_FRAME_BYTES = 900 * 1024;
// gzip only pays off past a few hundred bytes; below this the header outweighs any saving, so the
// per-keystroke sync/awareness frames ride uncompressed
const COMPRESS_THRESHOLD = 512;

// [1-byte codec: 0 raw, 1 gzip][body]. Compression sits INSIDE the seal, so the relay only ever
// sees ciphertext; the codec byte tells the receiver whether to inflate before decoding.
async function pack(framed: Uint8Array): Promise<Uint8Array> {
	if (framed.byteLength >= COMPRESS_THRESHOLD) {
		const gz = await gzip(framed);
		if (gz.byteLength < framed.byteLength) {
			const out = new Uint8Array(gz.byteLength + 1);
			out[0] = 1;
			out.set(gz, 1);
			return out;
		}
	}
	const out = new Uint8Array(framed.byteLength + 1);
	out[0] = 0;
	out.set(framed, 1);
	return out;
}

async function unpack(body: Uint8Array): Promise<Uint8Array> {
	const rest = body.subarray(1);
	return body[0] === 1 ? gunzip(rest) : rest;
}

// a relay close code is authoritative for WHY the socket ended (the relay only sends 4003/4006 at
// join time, never mid-session), so the code alone maps to a reason
function closeReason(code?: string): SessionEndReason {
	if (code === '4010') return 'quota';
	if (code === '4001') return 'host-ended';
	if (code === '4006') return 'full';
	if (code === '4003') return 'no-session';
	return 'relay-closed';
}

export interface SessionEvents {
	onPeersChange?: (peers: Map<number, PeerInfo>) => void;
	onControl?: (payload: ControlPayload, from: number) => void;
	/** a fully reassembled blob arrived (v1: the compiled PDF). */
	onBlob?: (name: string, rev: number, bytes: Uint8Array) => void;
	/** the host was asked for a blob; answer with sendBlob(...) addressed to `from`. */
	onBlobRequest?: (name: string, from: number) => void;
	/** a guest uploaded a file (host only): write it to disk. */
	onUpload?: (path: string, bytes: Uint8Array) => void;
	onStatus?: (s: TransportStatus | 'host-gone' | 'host-back', detail?: string) => void;
	onSessionEnd?: (reason: SessionEndReason, detail?: string) => void;
}

/** shared-doc layout: the manifest (file tree), per-file bodies, and host locks. */
export const manifestOf = (doc: Y.Doc) => doc.getMap<ManifestEntry>('manifest');
export const locksOf = (doc: Y.Doc) => doc.getMap<number>('locks');
export const metaOf = (doc: Y.Doc) => doc.getMap<number | string>('meta');
export const textOf = (doc: Y.Doc, relPath: string) => doc.getText('f:' + relPath);

export interface ManifestEntry {
	kind: 'text' | 'binary';
	size: number;
	/** original on-disk line ending for text files; writes restore it. */
	eol?: '\r\n' | '\n';
	/** tombstone: file was deleted on the host. */
	gone?: boolean;
	/** binaries only: changes when the bytes do (host mtime), so a guest can drop a stale blob.
	 *  Text needs none, its edits arrive through the CRDT. */
	rev?: number;
}

export class CollabSession {
	readonly doc: Y.Doc;
	readonly awareness: Awareness;
	readonly role: 'host' | 'guest';
	readonly peers = new Map<number, PeerInfo>();

	private readonly transport: Transport;
	private readonly key: CryptoKey;
	private readonly events: SessionEvents;
	private readonly assembler = new BlobAssembler();
	private readonly uploadAssembler = new BlobAssembler();
	private readonly user: PeerInfo;
	private destroyed = false;
	// the host's clientID, learned ONLY from frames the relay marked host-origin — never from a
	// peer's self-reported role, so a guest can't impersonate the host
	private authHostId: number | null = null;
	// seal/open are async; frames must apply in arrival order, so both directions run on chains
	private sendChain: Promise<void> = Promise.resolve();
	private recvChain: Promise<void> = Promise.resolve();

	constructor(opts: {
		doc: Y.Doc;
		transport: Transport;
		key: CryptoKey;
		role: 'host' | 'guest';
		user: { name: string; color: string };
		events?: SessionEvents;
	}) {
		this.doc = opts.doc;
		this.transport = opts.transport;
		this.key = opts.key;
		this.role = opts.role;
		this.events = opts.events ?? {};
		this.user = { ...opts.user, role: opts.role };
		this.awareness = new Awareness(this.doc);
		this.awareness.setLocalStateField('user', opts.user);
		this.awareness.setLocalStateField('role', opts.role);

		this.doc.on('update', this.onDocUpdate);
		this.awareness.on('update', this.onAwarenessUpdate);
		this.awareness.on('change', this.rebuildPeers);
		this.transport.onMessage = (data, fromHost) => {
			this.recvChain = this.recvChain.then(() => this.receive(data, fromHost)).catch(() => {});
		};
		this.transport.onNotice = this.onNotice;
		this.transport.onStatus = (s, detail) => {
			if (s === 'connected') this.handshake();
			if (s === 'closed') this.end(closeReason(detail), detail);
			this.events.onStatus?.(s, detail);
		};
	}

	get clientId(): number {
		return this.doc.clientID;
	}

	/** the host's Y clientID, learned from a relay-authenticated host frame. */
	get hostId(): number | null {
		return this.authHostId;
	}

	// roster is derived from awareness (the reliable presence signal), so departed peers prune
	// automatically via awareness removals; host role is authoritative (authHostId), never
	// self-reported, so a guest can't paint itself as the host
	private rebuildPeers = () => {
		this.peers.clear();
		for (const [id, state] of this.awareness.getStates()) {
			if (id === this.clientId) continue;
			const user = (state as { user?: { name: string; color: string } }).user;
			if (user) this.peers.set(id, { name: user.name, color: user.color, role: id === this.authHostId ? 'host' : 'guest' });
		}
		this.events.onPeersChange?.(this.peers);
	};

	// ---- outbound ----

	private post(frame: Frame): void {
		if (this.destroyed) return;
		const framed = encodeFrame(frame);
		this.sendChain = this.sendChain
			.then(async () => {
				const sealed = await seal(this.key, await pack(framed));
				if (sealed.byteLength > MAX_FRAME_BYTES) {
					console.warn(`[collab] dropping a ${sealed.byteLength}-byte frame over the relay's ${MAX_FRAME_BYTES}-byte cap`);
					return;
				}
				this.transport.send(sealed);
			})
			.catch(() => {});
	}

	private onDocUpdate = (update: Uint8Array, origin: unknown) => {
		if (origin === this) return; // arrived from the wire, don't echo
		const enc = encoding.createEncoder();
		syncProtocol.writeUpdate(enc, update);
		this.post({ type: FrameType.Sync, from: this.clientId, to: BROADCAST, payload: encoding.toUint8Array(enc) });
	};

	private onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
		if (origin === 'remote') return;
		const changed = added.concat(updated, removed);
		this.post({
			type: FrameType.Awareness,
			from: this.clientId,
			to: BROADCAST,
			payload: encodeAwarenessUpdate(this.awareness, changed)
		});
	};

	/** hello + sync step1 + full awareness; runs on every (re)connect. */
	private handshake(): void {
		this.post({ type: FrameType.Hello, from: this.clientId, to: BROADCAST, payload: this.user });
		const enc = encoding.createEncoder();
		syncProtocol.writeSyncStep1(enc, this.doc);
		this.post({ type: FrameType.Sync, from: this.clientId, to: BROADCAST, payload: encoding.toUint8Array(enc) });
		this.post({
			type: FrameType.Awareness,
			from: this.clientId,
			to: BROADCAST,
			payload: encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()])
		});
	}

	sendControl(payload: ControlPayload, to: number = BROADCAST): void {
		this.post({ type: FrameType.Control, from: this.clientId, to, payload });
	}

	requestBlob(name: string): void {
		this.post({ type: FrameType.BlobRequest, from: this.clientId, to: this.hostId ?? BROADCAST, name });
	}

	sendBlob(name: string, rev: number, bytes: Uint8Array, to: number): void {
		for (const chunk of chunkBlob(name, rev, bytes)) {
			this.post({ type: FrameType.BlobChunk, from: this.clientId, to, payload: chunk });
		}
	}

	/** guest -> host: upload a file for the host to write to disk (path is manifest-relative). */
	sendUpload(path: string, bytes: Uint8Array): void {
		for (const chunk of chunkBlob(path, 0, bytes)) {
			this.post({ type: FrameType.Upload, from: this.clientId, to: this.hostId ?? BROADCAST, payload: chunk });
		}
	}

	// ---- inbound ----

	private async receive(sealed: Uint8Array, fromHost: boolean): Promise<void> {
		if (this.destroyed) return;
		let frame: Frame;
		try {
			frame = decodeFrame(await unpack(await open(this.key, sealed)));
		} catch {
			return; // tampered or foreign frame: drop silently
		}
		if (frame.to !== BROADCAST && frame.to !== this.clientId) return;
		// any relay-authenticated host frame nails down the host's identity for the whole session
		if (fromHost) this.authHostId = frame.from;
		switch (frame.type) {
			case FrameType.Sync: {
				const dec = decoding.createDecoder(frame.payload);
				const enc = encoding.createEncoder();
				syncProtocol.readSyncMessage(dec, enc, this.doc, this);
				// a step1 wants an answer; address it to the asker only
				if (encoding.length(enc) > 0) {
					this.post({ type: FrameType.Sync, from: this.clientId, to: frame.from, payload: encoding.toUint8Array(enc) });
				}
				break;
			}
			case FrameType.Awareness:
				applyAwarenessUpdate(this.awareness, frame.payload, 'remote');
				break;
			case FrameType.Hello: {
				// introduce ourselves and always re-offer our state, so a reconnecting peer catches
				// up on edits made while it was gone (its step2 reply carries what we missed too)
				this.post({ type: FrameType.Hello, from: this.clientId, to: frame.from, payload: this.user });
				const enc = encoding.createEncoder();
				syncProtocol.writeSyncStep1(enc, this.doc);
				this.post({ type: FrameType.Sync, from: this.clientId, to: frame.from, payload: encoding.toUint8Array(enc) });
				break;
			}
			case FrameType.BlobRequest:
				if (this.role === 'host') this.events.onBlobRequest?.(frame.name, frame.from);
				break;
			case FrameType.BlobChunk:
				// only the host serves blobs (PDF, file previews); a guest-origin blob is a poisoning attempt
				if (fromHost) {
					const done = this.assembler.add(frame.payload);
					if (done) this.events.onBlob?.(frame.payload.name, frame.payload.rev, done);
				}
				break;
			case FrameType.Upload:
				// only the host writes to disk; it reassembles a guest's uploaded file
				if (this.role === 'host') {
					const done = this.uploadAssembler.add(frame.payload);
					if (done) this.events.onUpload?.(frame.payload.name, done);
				}
				break;
			case FrameType.Control:
				// session-end is host-authoritative; ignore a guest forging it
				if (frame.payload.kind === 'session-end') {
					if (fromHost) this.end('host-ended');
				} else this.events.onControl?.(frame.payload, frame.from);
				break;
		}
	}

	private onNotice = (n: RelayNotice) => {
		// the relay's session-end notice is authoritative (it only fires when the real host drops or
		// the room is torn down), unlike a forgeable in-band control frame
		if (n.t === 'session-end') this.end('host-ended');
		else if (n.t === 'host-gone') this.events.onStatus?.('host-gone');
		else if (n.t === 'host-back') this.events.onStatus?.('host-back');
		// a 'peer-left' has no id; the departing peer's awareness removal (or the 30s timeout) prunes
		// the roster via rebuildPeers, so nothing to do here
	};

	/** host only: tell everyone the session is over, then tear down. */
	endForEveryone(): void {
		this.sendControl({ kind: 'session-end' });
		// give the sealed frame a beat to leave before the socket drops
		setTimeout(() => this.destroy(), 150);
	}

	private end(reason: SessionEndReason, detail?: string): void {
		if (this.destroyed) return;
		this.events.onSessionEnd?.(reason, detail);
		this.destroy();
	}

	destroy(): void {
		if (this.destroyed) return;
		// announce our departure BEFORE detaching handlers, so peers drop our cursor at once instead
		// of waiting out awareness's 30s timeout. removeAwarenessStates fires 'update' synchronously,
		// which posts the removal frame onto sendChain while onAwarenessUpdate is still attached.
		try {
			removeAwarenessStates(this.awareness, [this.clientId], 'local');
		} catch {
			/* awareness already torn down */
		}
		this.destroyed = true;
		this.doc.off('update', this.onDocUpdate);
		this.awareness.off('update', this.onAwarenessUpdate);
		this.awareness.off('change', this.rebuildPeers);
		this.awareness.destroy();
		this.transport.onMessage = null;
		this.transport.onNotice = null;
		this.transport.onStatus = null;
		// close only after the departure frame has been sealed and sent
		const tp = this.transport;
		this.sendChain.finally(() => tp.close());
	}
}
