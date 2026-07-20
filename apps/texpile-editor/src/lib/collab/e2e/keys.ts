// Derive the relay room id, join proof, and AES-GCM content key from the share code (HKDF). The
// room id + proof are safe to show the relay; the content key never leaves the clients.

import { normalizeShareCode } from './shareCode';

export interface SessionKeys {
	/** relay room address; safe to show the relay. */
	roomId: string;
	/** admission ticket; the relay stores only its hash. */
	joinProof: string;
	/** AES-256-GCM content key; never leaves the clients. */
	contentKey: CryptoKey;
}

const te = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hkdf(code: string, info: string, bits: number): Promise<ArrayBuffer> {
	const ikm = await crypto.subtle.importKey('raw', te.encode(normalizeShareCode(code)), 'HKDF', false, ['deriveBits']);
	return crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt: te.encode('texpile-collab-v1'), info: te.encode(info) },
		ikm,
		bits
	);
}

export async function deriveSessionKeys(code: string): Promise<SessionKeys> {
	const [room, proof, keyBits] = await Promise.all([hkdf(code, 'room', 128), hkdf(code, 'proof', 256), hkdf(code, 'content', 256)]);
	const contentKey = await crypto.subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
	return { roomId: hex(room), joinProof: hex(proof), contentKey };
}

/** sha-256 hex; the relay stores this of the join proof, never the proof itself. */
export async function sha256Hex(s: string): Promise<string> {
	return hex(await crypto.subtle.digest('SHA-256', te.encode(s)));
}
