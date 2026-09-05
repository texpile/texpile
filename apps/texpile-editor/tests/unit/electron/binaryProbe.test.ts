import { describe, expect, it } from 'vitest';
import { detectText } from '../../../../../electron/src/fs/binaryProbe';

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string) => new TextEncoder().encode(s);

describe('detectText', () => {
	it('plain text and a UTF-8 BOM are text', () => {
		const plain = ascii('\\documentclass{article}\n');
		expect(detectText(plain, plain.length)).toEqual({ binary: false, encoding: 'utf8' });
		const bom = bytes(0xef, 0xbb, 0xbf, 0x41, 0x42);
		expect(detectText(bom, bom.length)).toEqual({ binary: false, encoding: 'utf8bom' });
	});

	it('zero bytes in the UTF-16 pattern are UTF-16, not binary', () => {
		const le = bytes(0x41, 0x00, 0x42, 0x00, 0x43, 0x00);
		expect(detectText(le, le.length)).toEqual({ binary: false, encoding: 'utf16le' });
		const be = bytes(0x00, 0x41, 0x00, 0x42, 0x00, 0x43);
		expect(detectText(be, be.length)).toEqual({ binary: false, encoding: 'utf16be' });
	});

	it('a zero byte anywhere else is binary', () => {
		// the MZ header of a Windows executable
		const exe = bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00);
		expect(detectText(exe, exe.length).binary).toBe(true);
	});
});
