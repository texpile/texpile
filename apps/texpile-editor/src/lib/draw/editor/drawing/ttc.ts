/** face `subfont` (0-based) of a font collection as a standalone sfnt, which is all opentype.js parses; anything
 *  else passes through. A collection's table offsets count from the start of the file, so they are rewritten */
export function sfntFromTtc(buf: ArrayBuffer, subfont: number): ArrayBuffer {
	const dv = new DataView(buf);
	if (buf.byteLength < 16 || dv.getUint32(0) !== 0x74746366) return buf; // 'ttcf'
	const numFonts = dv.getUint32(8);
	const idx = Math.min(Math.max(subfont, 0), numFonts - 1);
	const base = dv.getUint32(12 + 4 * idx);
	const numTables = dv.getUint16(base + 4);
	const headLen = 12 + 16 * numTables;
	const tables: { off: number; len: number }[] = [];
	let total = headLen;
	for (let i = 0; i < numTables; i++) {
		const rec = base + 12 + 16 * i;
		tables.push({ off: dv.getUint32(rec + 8), len: dv.getUint32(rec + 12) });
		total += (tables[i].len + 3) & ~3;
	}
	const src = new Uint8Array(buf);
	const out = new Uint8Array(total);
	out.set(src.subarray(base, base + headLen));
	const odv = new DataView(out.buffer);
	let w = headLen;
	tables.forEach((t, i) => {
		out.set(src.subarray(t.off, t.off + t.len), w);
		odv.setUint32(12 + 16 * i + 8, w);
		w += (t.len + 3) & ~3;
	});
	return out.buffer;
}
