import { describe, it, expect } from 'vitest';
import { generateShareCode, normalizeShareCode, isValidShareCode } from '$lib/collab/e2e/shareCode';
import { deriveSessionKeys, sha256Hex } from '$lib/collab/e2e/keys';
import { seal, open } from '$lib/collab/e2e/seal';

describe('collab crypto', () => {
	it('generates valid, distinct share codes', () => {
		const a = generateShareCode();
		const b = generateShareCode();
		expect(isValidShareCode(a)).toBe(true);
		expect(isValidShareCode(b)).toBe(true);
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){4}-[A-Z2-9]$/);
	});

	it('normalizes separator and case noise to the same derivations', async () => {
		const code = generateShareCode();
		const sloppy = code.toLowerCase().replace(/-/g, ' ');
		expect(normalizeShareCode(sloppy)).toBe(normalizeShareCode(code));
		const k1 = await deriveSessionKeys(code);
		const k2 = await deriveSessionKeys(sloppy);
		expect(k1.roomId).toBe(k2.roomId);
		expect(k1.joinProof).toBe(k2.joinProof);
	});

	it('derives room, proof, and key that differ from each other and per code', async () => {
		const k1 = await deriveSessionKeys(generateShareCode());
		const k2 = await deriveSessionKeys(generateShareCode());
		expect(k1.roomId).not.toBe(k2.roomId);
		expect(k1.joinProof).not.toBe(k2.joinProof);
		expect(k1.roomId).not.toBe(k1.joinProof);
		expect(k1.roomId).toHaveLength(32);
		expect(k1.joinProof).toHaveLength(64);
		expect(await sha256Hex(k1.joinProof)).toHaveLength(64);
	});

	it('seal/open round-trips and rejects tampering and foreign keys', async () => {
		const { contentKey } = await deriveSessionKeys(generateShareCode());
		const msg = new TextEncoder().encode('hello \\LaTeX{} world');
		const sealed = await seal(contentKey, msg);
		expect(new Uint8Array(await open(contentKey, sealed))).toEqual(msg);
		// distinct nonces: sealing twice never yields the same bytes
		expect(await seal(contentKey, msg)).not.toEqual(sealed);
		const flipped = sealed.slice();
		flipped[flipped.length - 1] ^= 0xff;
		await expect(open(contentKey, flipped)).rejects.toThrow();
		const other = await deriveSessionKeys(generateShareCode());
		await expect(open(other.contentKey, sealed)).rejects.toThrow();
	});
});
