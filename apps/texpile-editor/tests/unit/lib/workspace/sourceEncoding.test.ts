// Every row is a REAL byte sequence decoded the way electron/src/fs/fsService.ts decodes it
// (readFile(path, 'utf-8')), so these assert what actually reaches the editor rather than what a
// hand-written string says it would.
import { describe, it, expect } from 'vitest';
import { sourceEncodingError } from '$lib/workspace/sourceEncoding';

const TEXT = '\\section{Caf\u00e9}\nDer wei\u00df.\n';
const ASCII = '\\section{Plain}\nNo accents.\n';

/** what fsService.read() hands the renderer for these bytes */
const asRead = (bytes: Buffer) => bytes.toString('utf-8');

const utf16le = (s: string) => Buffer.from(s, 'utf16le');
const utf16be = (s: string) => {
	const b = Buffer.from(s, 'utf16le');
	for (let i = 0; i < b.length; i += 2) [b[i], b[i + 1]] = [b[i + 1], b[i]];
	return b;
};
const utf32le = (s: string) => {
	const out = Buffer.alloc([...s].length * 4);
	let i = 0;
	for (const ch of s) {
		out.writeUInt32LE(ch.codePointAt(0)!, i);
		i += 4;
	}
	return out;
};
const withBom = (bom: number[], body: Buffer) => Buffer.concat([Buffer.from(bom), body]);

describe('sourceEncodingError', () => {
	it('opens the encodings Texpile actually supports', () => {
		expect(sourceEncodingError(asRead(Buffer.from(ASCII, 'ascii')))).toBeNull();
		expect(sourceEncodingError(asRead(Buffer.from(TEXT, 'utf8')))).toBeNull();
		// a UTF-8 BOM is preserved through the round trip, so it is not a reason to refuse
		expect(sourceEncodingError(asRead(withBom([0xef, 0xbb, 0xbf], Buffer.from(TEXT, 'utf8'))))).toBeNull();
	});

	// the reported bug: these decode to replacement characters, and the first autosave writes them
	// over the original bytes
	it('refuses a legacy 8-bit encoding', () => {
		const msg = sourceEncodingError(asRead(Buffer.from(TEXT, 'latin1')));
		expect(msg).toBeTruthy();
		expect(msg).toMatch(/Latin-1/);
	});

	it('refuses UTF-16 and UTF-32, with or without a BOM', () => {
		for (const bytes of [
			withBom([0xff, 0xfe], utf16le(TEXT)),
			withBom([0xfe, 0xff], utf16be(TEXT)),
			withBom([0xff, 0xfe, 0x00, 0x00], utf32le(TEXT)),
			utf16le(TEXT),
			// the ones a decode check alone would MISS: pure ASCII in UTF-16/32 survives the round trip
			// byte for byte, because its padding NULs are valid UTF-8. Refused for being unreadable.
			utf16le(ASCII),
			utf32le(ASCII)
		]) {
			expect(sourceEncodingError(asRead(bytes))).toMatch(/UTF-16/);
		}
	});

	// a genuine UTF-8 file whose bytes merely LOOK like another encoding is not refused: it decodes
	// losslessly, so nothing can be destroyed by saving it
	it('opens a file whose latin1 reading would be mojibake but whose bytes are valid UTF-8', () => {
		expect(sourceEncodingError(asRead(Buffer.from('\\section{Caf\u00c3\u00a9}\n', 'latin1')))).toBeNull();
	});

	it('opens an empty file and plain prose', () => {
		expect(sourceEncodingError('')).toBeNull();
		expect(sourceEncodingError('\\documentclass{article}\n')).toBeNull();
	});
});
