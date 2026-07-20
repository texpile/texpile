// The share code: the session's root secret. Generate a fresh one, or normalize/validate a typed one.

const CODE_BYTES = 16;
// Crockford-ish: drops I/L/O/U plus 0/1, so 30 symbols not 32. upper-case, hyphen every 5 chars
const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function generateShareCode(): string {
	const raw = new Uint8Array(CODE_BYTES);
	crypto.getRandomValues(raw);
	// base-30 is 4.91 bits/char, so 26 chars is the shortest that still holds ~128 bits. 30^26 is
	// just under 2^128, so the last divide drops a remainder: 127-bit min-entropy, not an exact 128
	let n = 0n;
	for (const b of raw) n = (n << 8n) | BigInt(b);
	let s = '';
	for (let i = 0; i < 26; i++) {
		s = B32[Number(n % 30n)] + s;
		n /= 30n;
	}
	return s.replace(/(.{5})(?=.)/g, '$1-');
}

/** canonical form: strip separators/case noise so retyped codes still derive the same keys. */
export function normalizeShareCode(code: string): string {
	return code.toUpperCase().replace(/[^A-Z2-9]/g, '');
}

export function isValidShareCode(code: string): boolean {
	const c = normalizeShareCode(code);
	return c.length === 26 && [...c].every((ch) => B32.includes(ch));
}
