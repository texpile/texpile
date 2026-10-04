// Wire frames for shared sessions. Every frame is encoded here, sealed by crypto.ts, and
// broadcast through the relay (a blind pipe): addressing lives INSIDE the ciphertext, receivers
// drop frames not meant for them. lib0 keeps the encoding compatible with Yjs' own messages.

import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { isCommentEvent, type CommentEvent } from '$lib/comments/log';

export const BROADCAST = 0;

export enum FrameType {
	SYNC = 1, // y-protocols sync message (step1/step2/update)
	AWARENESS = 2, // y-protocols awareness update
	HELLO = 3, // announce self after connect
	BLOB_REQUEST = 4, // ask the host for a named blob (the PDF, or a file's bytes for previews)
	BLOB_CHUNK = 5, // one chunk of a host->guest blob transfer
	CONTROL = 6, // small JSON control messages (compile-request, session-end, synctex, ...)
	UPLOAD = 7, // one chunk of a guest->host file upload (host writes it to disk)
	PREVIEW = 8 // one hop of the Typst preview relay (host <-> guest, see PreviewPayload)
}

export type HelloPayload = {
	name: string;
	color: string;
	role: 'host' | 'guest';
	version?: string;
	oldest?: string;
	/** a host's own version, when version and oldest are the range of everyone in its session */
	hostVersion?: string;
};

export type BlobChunkPayload = {
	name: string;
	rev: number;
	index: number;
	total: number;
	bytes: Uint8Array;
};

export type ControlPayload =
	| { kind: 'compile-request' }
	| { kind: 'compile-status'; state: 'started' | 'done' | 'failed' }
	| { kind: 'session-end' }
	// SyncTeX, resolved host-side (it holds the .synctex data) and replied to the asking guest
	| { kind: 'synctex-inverse'; reqId: number; page: number; x: number; y: number }
	| { kind: 'synctex-inverse-result'; reqId: number; file: string; line: number; selectText?: string }
	| { kind: 'synctex-forward'; reqId: number; file: string; line: number }
	| { kind: 'synctex-forward-result'; reqId: number; page: number; x: number; y: number; w?: number; h?: number }
	// Typst src -> preview: the host resolves the position through its tinymist and the resulting
	// jump frame comes back over the PREVIEW channel, routed to only the asking guest - so there
	// is no result payload here. file is manifest-relative; line/character are zero-based (LSP).
	| { kind: 'typst-scroll'; file: string; line: number; character: number }
	// the reverse direction: a guest clicked its streamed preview; the host's tinymist resolved
	// the span and this is the answer, routed to only the clicking guest. file is manifest-
	// relative; line is zero-based (LSP), matching PreviewJumpInfo.
	| { kind: 'typst-jump'; file: string; line: number }
	// guest asks the host (the only disk-writer) to mutate a file; paths are manifest-relative
	| { kind: 'file-op'; op: 'rename' | 'delete'; from: string; to?: string }
	/**
	 * Typst intellisense for a guest, answered by the HOST's tinymist.
	 *
	 * A guest has no typst toolchain and no project on disk. The host has both, and is already
	 * looking at what the guest typed: materialize.ts writes guest edits through to the host's
	 * disk, and tinymist picks those writes up by itself even for a file nobody has open
	 * (measured). So this is a plain request relay - no document sync, no shadow filesystem, and
	 * no assets to ship, which is what made the alternative keep sprouting gaps (.typ, then .bib,
	 * then images, then fonts).
	 *
	 * `method` and `params` are LSP's own, verbatim, and `reqId` is the client's own JSON-RPC id
	 * rather than a second counter. Documents are addressed by the `texpile-session:` scheme (see
	 * sessionUri) so a URI that escapes the mapping fails loudly instead of resolving to some
	 * unrelated real path on the host.
	 */
	// reqId is the client's own JSON-RPC id, carried verbatim - JSON-RPC allows strings there, and
	// coercing one to a number yields NaN, which serialises to null and can never be matched back
	| { kind: 'lsp-request'; reqId: number | string; method: string; params?: unknown }
	| { kind: 'lsp-result'; reqId: number | string; ok: boolean; result?: unknown; error?: string }
	// host -> guests, unsolicited: tinymist's live diagnostics. Measured to be published for files
	// the host does not have open, so this is a straight relay rather than the host having to hold
	// every guest's file open on their behalf.
	| { kind: 'lsp-notify'; method: string; params?: unknown };

/**
 * One hop of the Typst preview relay.
 *
 * The host runs tinymist's preview and, per guest, holds one websocket to its loopback data plane;
 * these frames carry that socket's traffic over the session, opaquely - neither side interprets the
 * data-plane protocol. The GUEST owns the connection lifecycle: `conn` is a guest-chosen epoch,
 * bumped on every (re)attach, and both sides drop frames for another epoch as stale. Recovery is
 * drop-and-reattach: there is no retransmission, a guest that detects a gap closes and reopens.
 */
export type PreviewPayload = {
	/** guest-chosen connection epoch; frames for another epoch are stale and dropped */
	conn: number;
	/** open: guest asks / host confirms; data: binary data-plane bytes; text: a data-plane text
	 *  frame (utf-8 in `bytes`); close: either side tears the connection down */
	ev: 'open' | 'data' | 'text' | 'close';
	/** host->guest: counts every frame on this conn, so a relay drop is a visible gap. 0 from guests. */
	seq: number;
	/** chunking of one oversized data-plane message: this piece / how many (0/1 when whole) */
	part: number;
	parts: number;
	bytes: Uint8Array;
};

const PREVIEW_EVS = ['open', 'data', 'text', 'close'] as const;

/** a manifest-relative path a guest may name in a file-op: forward slashes, inside the root. */
export function isSafeRel(rel: string): boolean {
	if (!rel || rel.includes('\\') || rel.startsWith('/') || /^[a-z]:/i.test(rel)) return false;
	return rel.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export function isSafeCommentEvent(event: unknown): event is CommentEvent {
	if (!isCommentEvent(event)) return false;
	const paths = event.t === 'open' ? [event.file] : event.t === 'move' ? [event.from, event.to] : event.t === 'anchor' ? [event.file] : [];
	return paths.every((p) => p === undefined || isSafeRel(p));
}

export type Frame =
	| { type: FrameType.SYNC; from: number; to: number; payload: Uint8Array }
	| { type: FrameType.AWARENESS; from: number; to: number; payload: Uint8Array }
	| { type: FrameType.HELLO; from: number; to: number; payload: HelloPayload }
	| { type: FrameType.BLOB_REQUEST; from: number; to: number; name: string }
	| { type: FrameType.BLOB_CHUNK; from: number; to: number; payload: BlobChunkPayload }
	| { type: FrameType.CONTROL; from: number; to: number; payload: ControlPayload }
	| { type: FrameType.UPLOAD; from: number; to: number; payload: BlobChunkPayload }
	| { type: FrameType.PREVIEW; from: number; to: number; payload: PreviewPayload };

export function encodeFrame(frame: Frame): Uint8Array {
	const enc = encoding.createEncoder();
	encoding.writeVarUint(enc, frame.type);
	encoding.writeVarUint(enc, frame.from);
	encoding.writeVarUint(enc, frame.to);
	switch (frame.type) {
		case FrameType.SYNC:
		case FrameType.AWARENESS:
			encoding.writeVarUint8Array(enc, frame.payload);
			break;
		case FrameType.HELLO:
			encoding.writeVarString(enc, JSON.stringify(frame.payload));
			break;
		case FrameType.BLOB_REQUEST:
			encoding.writeVarString(enc, frame.name);
			break;
		case FrameType.BLOB_CHUNK:
		case FrameType.UPLOAD:
			encoding.writeVarString(enc, frame.payload.name);
			encoding.writeVarUint(enc, frame.payload.rev);
			encoding.writeVarUint(enc, frame.payload.index);
			encoding.writeVarUint(enc, frame.payload.total);
			encoding.writeVarUint8Array(enc, frame.payload.bytes);
			break;
		case FrameType.CONTROL:
			encoding.writeVarString(enc, JSON.stringify(frame.payload));
			break;
		case FrameType.PREVIEW:
			encoding.writeVarUint(enc, frame.payload.conn);
			encoding.writeVarUint(enc, PREVIEW_EVS.indexOf(frame.payload.ev));
			encoding.writeVarUint(enc, frame.payload.seq);
			encoding.writeVarUint(enc, frame.payload.part);
			encoding.writeVarUint(enc, frame.payload.parts);
			encoding.writeVarUint8Array(enc, frame.payload.bytes);
			break;
	}
	return encoding.toUint8Array(enc);
}

export function decodeFrame(bytes: Uint8Array): Frame {
	const dec = decoding.createDecoder(bytes);
	const type = decoding.readVarUint(dec) as FrameType;
	const from = decoding.readVarUint(dec);
	const to = decoding.readVarUint(dec);
	switch (type) {
		case FrameType.SYNC:
		case FrameType.AWARENESS:
			return { type, from, to, payload: decoding.readVarUint8Array(dec) };
		case FrameType.HELLO:
			return { type, from, to, payload: JSON.parse(decoding.readVarString(dec)) as HelloPayload };
		case FrameType.BLOB_REQUEST:
			return { type, from, to, name: decoding.readVarString(dec) };
		case FrameType.BLOB_CHUNK:
		case FrameType.UPLOAD:
			return {
				type,
				from,
				to,
				payload: {
					name: decoding.readVarString(dec),
					rev: decoding.readVarUint(dec),
					index: decoding.readVarUint(dec),
					total: decoding.readVarUint(dec),
					bytes: decoding.readVarUint8Array(dec)
				}
			};
		case FrameType.CONTROL:
			return { type, from, to, payload: JSON.parse(decoding.readVarString(dec)) as ControlPayload };
		case FrameType.PREVIEW: {
			const conn = decoding.readVarUint(dec);
			const ev = PREVIEW_EVS[decoding.readVarUint(dec)];
			if (!ev) throw new Error('unknown preview event');
			return {
				type,
				from,
				to,
				payload: {
					conn,
					ev,
					seq: decoding.readVarUint(dec),
					part: decoding.readVarUint(dec),
					parts: decoding.readVarUint(dec),
					bytes: decoding.readVarUint8Array(dec)
				}
			};
		}
		default:
			throw new Error(`unknown frame type ${type}`);
	}
}

// the relay caps a session at this many guests; the client only displays it, the relay enforces it
export const MAX_GUESTS = 8;

// 256 KB chunks: sealed frames must stay under the relay's 1 MiB message cap with room to spare
export const BLOB_CHUNK_SIZE = 256 * 1024;
// a reassembled blob (image or PDF) may not exceed this many chunks; caps the buffer a peer can
// make us allocate from an attacker-chosen `total` (8192 * 256 KB = 2 GiB, the session byte quota)
const MAX_BLOB_CHUNKS = 8192;

export function chunkBlob(name: string, rev: number, bytes: Uint8Array): BlobChunkPayload[] {
	const total = Math.max(1, Math.ceil(bytes.byteLength / BLOB_CHUNK_SIZE));
	const chunks: BlobChunkPayload[] = [];
	for (let i = 0; i < total; i++) {
		chunks.push({ name, rev, index: i, total, bytes: bytes.subarray(i * BLOB_CHUNK_SIZE, (i + 1) * BLOB_CHUNK_SIZE) });
	}
	return chunks;
}

/** reassembles chunk streams per (name, rev); returns the whole blob when the last piece lands. */
export class BlobAssembler {
	private parts = new Map<string, { total: number; got: number; pieces: (Uint8Array | null)[] }>();

	add(c: BlobChunkPayload): Uint8Array | null {
		// validate the attacker-controlled shape BEFORE allocating: a bogus `total` must never size a buffer
		if (!Number.isInteger(c.total) || c.total < 1 || c.total > MAX_BLOB_CHUNKS) return null;
		if (!Number.isInteger(c.index) || c.index < 0 || c.index >= c.total) return null;
		const id = `${c.name}@${c.rev}`;
		let entry = this.parts.get(id);
		if (!entry || entry.total !== c.total) {
			entry = { total: c.total, got: 0, pieces: new Array(c.total).fill(null) };
			this.parts.set(id, entry);
			// a newer rev of the same blob obsoletes any half-done older transfer
			for (const key of this.parts.keys()) {
				if (key !== id && key.startsWith(`${c.name}@`)) this.parts.delete(key);
			}
		}
		if (entry.pieces[c.index]) return null; // duplicate chunk (index bounds already checked above)
		entry.pieces[c.index] = c.bytes;
		entry.got++;
		if (entry.got < entry.total) return null;
		this.parts.delete(id);
		const size = entry.pieces.reduce((n, p) => n + (p ? p.byteLength : 0), 0);
		const out = new Uint8Array(size);
		let off = 0;
		for (const p of entry.pieces) {
			out.set(p as Uint8Array, off);
			off += (p as Uint8Array).byteLength;
		}
		return out;
	}
}

/**
 * Split one data-plane message into sealed-frame-sized preview payloads.
 *
 * `seq` numbers every RESULTING frame, not the message: the receiver checks plain continuity and
 * cares nothing for message boundaries, so a drop inside a chunk run is caught the same way as a
 * drop between messages. Returns the payloads and the seq the next call should start from.
 */
export function chunkPreview(
	conn: number,
	ev: 'data' | 'text',
	seq: number,
	bytes: Uint8Array
): { payloads: PreviewPayload[]; nextSeq: number } {
	const parts = Math.max(1, Math.ceil(bytes.byteLength / BLOB_CHUNK_SIZE));
	const payloads: PreviewPayload[] = [];
	for (let i = 0; i < parts; i++) {
		payloads.push({ conn, ev, seq: seq + i, part: i, parts, bytes: bytes.subarray(i * BLOB_CHUNK_SIZE, (i + 1) * BLOB_CHUNK_SIZE) });
	}
	return { payloads, nextSeq: seq + parts };
}

// one reassembled data-plane message may not exceed this many chunks (128 * 256 KB = 32 MB);
// bounds the buffer a hostile peer's `parts` can make us allocate, far above any real render frame
const MAX_PREVIEW_CHUNKS = 128;

/**
 * The guest end of one preview connection: checks frame continuity and reassembles chunked
 * messages. One instance per `conn` epoch, thrown away on reattach.
 */
export class PreviewStream {
	private nextSeq = 0;
	private parts: Uint8Array[] = [];

	/**
	 * Feed one host->guest payload. Returns the completed message, null while a chunk run is still
	 * arriving, or 'gap' when a frame was lost (relay drop) - the caller must then close this conn
	 * and reattach with a fresh epoch, because everything after a gap is undecodable.
	 */
	add(p: PreviewPayload): { bytes: Uint8Array; text: boolean } | null | 'gap' {
		if (p.seq !== this.nextSeq) return 'gap';
		this.nextSeq = p.seq + 1;
		if (!Number.isInteger(p.parts) || p.parts < 1 || p.parts > MAX_PREVIEW_CHUNKS) return 'gap';
		if (p.part !== this.parts.length) return 'gap'; // continuity held but the chunk run didn't
		this.parts.push(p.bytes);
		if (this.parts.length < p.parts) return null;
		const collected = this.parts;
		this.parts = [];
		if (collected.length === 1) return { bytes: collected[0], text: p.ev === 'text' };
		const size = collected.reduce((n, c) => n + c.byteLength, 0);
		const out = new Uint8Array(size);
		let off = 0;
		for (const c of collected) {
			out.set(c, off);
			off += c.byteLength;
		}
		return { bytes: out, text: p.ev === 'text' };
	}
}

// relay-level notices arrive as plaintext JSON text frames (the relay can't read sealed
// binary frames, but it does know connection-level facts)
export type RelayNotice = {
	t: 'peers' | 'peer-left' | 'host-gone' | 'host-back' | 'session-end' | 'error';
	count?: number;
	message?: string;
};

export function parseRelayNotice(text: string): RelayNotice | null {
	try {
		const v = JSON.parse(text);
		return v && typeof v.t === 'string' ? (v as RelayNotice) : null;
	} catch {
		return null;
	}
}
