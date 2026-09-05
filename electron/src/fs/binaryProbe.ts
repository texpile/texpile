// Does a file look binary? The first 512 bytes decide, the way VS Code decides it.
import { open } from 'node:fs/promises';

export type TextEncoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be';

// Ported from VS Code's detectEncodingFromBuffer (src/vs/workbench/services/textfile/common/
// encoding.ts). A zero byte in the first 512 means binary, unless every zero sits where UTF-16
// LE or BE would put one, in which case the file is UTF-16 text. Same known blind spots: a
// binary file whose bytes happen to alternate with zeros reads as UTF-16, and a UTF-16 file
// with 4-byte characters can read as binary.
const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512;

function bomOf(b: Uint8Array, bytesRead: number): TextEncoding | null {
	if (bytesRead >= 2) {
		if (b[0] === 0xfe && b[1] === 0xff) return 'utf16be';
		if (b[0] === 0xff && b[1] === 0xfe) return 'utf16le';
	}
	if (bytesRead >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf8bom';
	return null;
}

export function detectText(buffer: Uint8Array, bytesRead: number): { binary: boolean; encoding: TextEncoding } {
	let encoding = bomOf(buffer, bytesRead);
	let seemsBinary = false;
	if (encoding !== 'utf16be' && encoding !== 'utf16le') {
		let couldBeUTF16LE = true; // e.g. 0xAA 0x00
		let couldBeUTF16BE = true; // e.g. 0x00 0xAA
		let containsZeroByte = false;
		for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
			const isEndian = i % 2 === 1; // assume 2-byte sequences typical for UTF-16
			const isZeroByte = buffer[i] === 0;
			if (isZeroByte) containsZeroByte = true;
			if (couldBeUTF16LE && ((isEndian && !isZeroByte) || (!isEndian && isZeroByte))) couldBeUTF16LE = false;
			if (couldBeUTF16BE && ((isEndian && isZeroByte) || (!isEndian && !isZeroByte))) couldBeUTF16BE = false;
			// neither UTF-16 LE nor BE, so a zero byte means binary
			if (isZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) break;
		}
		if (containsZeroByte) {
			if (couldBeUTF16LE) encoding = 'utf16le';
			else if (couldBeUTF16BE) encoding = 'utf16be';
			else seemsBinary = true;
		}
	}
	return { binary: seemsBinary, encoding: encoding ?? 'utf8' };
}

/** reads only the first 512 bytes, so probing a large file costs the same as a small one */
export async function probe(path: string): Promise<{ size: number; binary: boolean; encoding: TextEncoding }> {
	if (!path) throw new Error('Missing path');
	const fh = await open(path, 'r');
	try {
		const buffer = new Uint8Array(ZERO_BYTE_DETECTION_BUFFER_MAX_LEN);
		const { bytesRead } = await fh.read(buffer, 0, buffer.length, 0);
		const { size } = await fh.stat();
		return { size, ...detectText(buffer, bytesRead) };
	} finally {
		await fh.close();
	}
}
