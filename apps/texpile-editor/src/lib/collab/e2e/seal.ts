// Seal and open frames with AES-GCM (a fresh random nonce per frame). open() throws on tampered
// or foreign-key data — that GCM auth failure is how the session drops frames it can't trust.

const NONCE_BYTES = 12;

/** [12-byte nonce][ciphertext+tag]; a fresh random nonce per frame. */
export async function seal(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
	const nonce = new Uint8Array(NONCE_BYTES);
	crypto.getRandomValues(nonce);
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext as BufferSource);
	const out = new Uint8Array(NONCE_BYTES + ct.byteLength);
	out.set(nonce, 0);
	out.set(new Uint8Array(ct), NONCE_BYTES);
	return out;
}

/** inverse of seal; throws on tampered or foreign-key data (GCM auth failure). */
export async function open(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
	if (sealed.byteLength < NONCE_BYTES + 16) throw new Error('sealed frame too short');
	// copies: subarrays of a shared buffer don't satisfy WebCrypto's ArrayBuffer-backed types
	const nonce = sealed.slice(0, NONCE_BYTES);
	const ct = sealed.slice(NONCE_BYTES);
	const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct);
	return new Uint8Array(pt);
}
