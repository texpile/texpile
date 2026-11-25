import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isTokenName } from '$lib/editor/canvas/style/theme/tokenList';

const SRC = path.resolve(import.meta.dirname, '../../../../../../../src');
// a file that hands the canvas a look, as a decoration, a view or a suggester does
const DECLARES_LOOK = /canvasLook|suggestLook|\blook: \{/;

function sourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const at = path.join(dir, e.name);
		if (e.isDirectory()) return sourceFiles(at);
		return /\.ts$/.test(e.name) ? [at] : [];
	});
}

describe('canvas looks', () => {
	// a name off the list throws in dev, and the paint that threw draws its block as source
	it('name only theme tokens', () => {
		const unknown: string[] = [];
		for (const file of sourceFiles(SRC)) {
			const text = fs.readFileSync(file, 'utf8');
			if (!DECLARES_LOOK.test(text)) continue;
			for (const [, name] of text.matchAll(/var\((--[\w-]+)/g))
				if (!isTokenName(name)) unknown.push(`${path.relative(SRC, file)}: ${name}`);
		}
		expect(unknown).toEqual([]);
	});
});
