// Wire frames for shared sessions. Every frame is encoded here, sealed by crypto.ts, and
// broadcast through the relay (a blind pipe): addressing lives INSIDE the ciphertext, receivers
// drop frames not meant for them. lib0 keeps the encoding compatible with Yjs' own messages.

import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

export const BROADCAST = 0;

export enum FrameType {
	Sync = 1, // y-protocols sync message (step1/step2/update)
	Awareness = 2, // y-protocols awareness update
	Hello = 3, // announce self after connect
	BlobRequest = 4, // ask the host for a named blob (the PDF, or a file's bytes for previews)
	BlobChunk = 5, // one chunk of a host->guest blob transfer
	Control = 6, // small JSON control messages (compile-request, session-end, synctex, ...)
	Upload = 7 // one chunk of a guest->host file upload (host writes it to disk)
}

export interface HelloPayload {
	name: string;
	color: string;
	role: 'host' | 'guest';
}

export interface BlobChunkPayload {
	name: string;
	rev: number;
	index: number;
	total: number;
	bytes: Uint8Array;
}

export type ControlPayload =
	| { kind: 'compile-request' }
	| { kind: 'compile-status'; state: 'started' | 'done' | 'failed' }
	| { kind: 'session-end' }
	// SyncTeX, resolved host-side (it holds the .synctex data) and replied to the asking guest
	| { kind: 'synctex-inverse'; reqId: number; page: number; x: number; y: number }
	| { kind: 'synctex-inverse-result'; reqId: number; file: string; line: number; selectText?: string }
	| { kind: 'synctex-forward'; reqId: number; file: string; line: number }
	| { kind: 'synctex-forward-result'; reqId: number; page: number; x: number; y: number; w?: number; h?: number };

export type Frame =
	| { type: FrameType.Sync; from: number; to: number; payload: Uint8Array }
	| { type: FrameType.Awareness; from: number; to: number; payload: Uint8Array }
	| { type: FrameType.Hello; from: number; to: number; payload: HelloPayload }
	| { type: FrameType.BlobRequest; from: number; to: number; name: string }
	| { type: FrameType.BlobChunk; from: number; to: number; payload: BlobChunkPayload }
	| { type: FrameType.Control; from: number; to: number; payload: ControlPayload }
	| { type: FrameType.Upload; from: number; to: number; payload: BlobChunkPayload };

export function encodeFrame(frame: Frame): Uint8Array {
	const enc = encoding.createEncoder();
	encoding.writeVarUint(enc, frame.type);
	encoding.writeVarUint(enc, frame.from);
	encoding.writeVarUint(enc, frame.to);
	switch (frame.type) {
		case FrameType.Sync:
		case FrameType.Awareness:
			encoding.writeVarUint8Array(enc, frame.payload);
			break;
		case FrameType.Hello:
			encoding.writeVarString(enc, JSON.stringify(frame.payload));
			break;
		case FrameType.BlobRequest:
			encoding.writeVarString(enc, frame.name);
			break;
		case FrameType.BlobChunk:
		case FrameType.Upload:
			encoding.writeVarString(enc, frame.payload.name);
			encoding.writeVarUint(enc, frame.payload.rev);
			encoding.writeVarUint(enc, frame.payload.index);
			encoding.writeVarUint(enc, frame.payload.total);
			encoding.writeVarUint8Array(enc, frame.payload.bytes);
			break;
		case FrameType.Control:
			encoding.writeVarString(enc, JSON.stringify(frame.payload));
			break;
	}
	return encoding.toUint8Array(enc);
}

export function decodeFrame(data: Uint8Array): Frame {
	const dec = decoding.createDecoder(data);
	const type = decoding.readVarUint(dec) as FrameType;
	const from = decoding.readVarUint(dec);
	const to = decoding.readVarUint(dec);
	switch (type) {
		case FrameType.Sync:
		case FrameType.Awareness:
			return { type, from, to, payload: decoding.readVarUint8Array(dec) };
		case FrameType.Hello:
			return { type, from, to, payload: JSON.parse(decoding.readVarString(dec)) as HelloPayload };
		case FrameType.BlobRequest:
			return { type, from, to, name: decoding.readVarString(dec) };
		case FrameType.BlobChunk:
		case FrameType.Upload:
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
		case FrameType.Control:
			return { type, from, to, payload: JSON.parse(decoding.readVarString(dec)) as ControlPayload };
		default:
			throw new Error(`unknown frame type ${type}`);
	}
}

// 256 KB chunks: sealed frames must stay under the relay's 1 MiB message cap with room to spare
export const BLOB_CHUNK_SIZE = 256 * 1024;

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
		if (c.index >= entry.total || entry.pieces[c.index]) return null;
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

// relay-level notices arrive as plaintext JSON text frames (the relay can't read sealed
// binary frames, but it does know connection-level facts)
export interface RelayNotice {
	t: 'peers' | 'peer-left' | 'host-gone' | 'host-back' | 'session-end' | 'error';
	count?: number;
	message?: string;
}

export function parseRelayNotice(text: string): RelayNotice | null {
	try {
		const v = JSON.parse(text);
		return v && typeof v.t === 'string' ? (v as RelayNotice) : null;
	} catch {
		return null;
	}
}
