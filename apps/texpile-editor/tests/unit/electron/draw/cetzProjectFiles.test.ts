import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { drawWithTinymist, hasTinymist, useTinymist } from '../../lib/draw/engines/tinymistEngine';

/** a 1×1 red PNG */
function png(): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const size = Buffer.alloc(4);
		size.writeUInt32BE(data.length);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(body));
		return Buffer.concat([size, body, crc]);
	};
	const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
	return Buffer.concat([
		Buffer.from('89504e470d0a1a0a', 'hex'),
		chunk('IHDR', header),
		chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))),
		chunk('IEND', Buffer.alloc(0))
	]);
}

describe.skipIf(!hasTinymist)('a CeTZ figure in a project', () => {
	useTinymist();

	it("reads the project's own imports and images, and writes nothing into it", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cetz-project-'));
		fs.mkdirSync(path.join(root, 'figures'));
		fs.writeFileSync(path.join(root, 'figures', 'theme.typ'), '#let accent = red\n');
		fs.writeFileSync(path.join(root, 'figures', 'dot.png'), png());
		const job = '#import "theme.typ": accent\n#circle(radius: 1cm, fill: accent)\n#image("dot.png", width: 1cm)\n';
		const result = await drawWithTinymist(job, root, path.join(root, 'figures', 'paper.typ'));
		expect(result.errors).toEqual([]);
		expect(result.svg).toContain('<svg');
		expect(fs.readdirSync(path.join(root, 'figures')).sort()).toEqual(['dot.png', 'theme.typ']);
	}, 60_000);
});
