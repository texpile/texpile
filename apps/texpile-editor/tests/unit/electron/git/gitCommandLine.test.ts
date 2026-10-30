// more files than one Windows command line holds, which failed every add, reset, checkout and
// folder commit past about 800 of them
import { describe, it, expect, afterEach } from 'vitest';
import { MAX_CLI_LENGTH, splitInChunks } from '../../../../../../electron/src/git/gitCommandLine';
import { removeTempDirs } from './gitLiveFixture';

afterEach(removeTempDirs);

describe('splitInChunks', () => {
	it('cuts where the paths, with a space and quotes each, would pass the limit', () => {
		expect([...splitInChunks(['hello', 'there', 'cool', 'stuff'], 16)]).toEqual([
			['hello', 'there'],
			['cool', 'stuff']
		]);
		expect([...splitInChunks(['longer-than-the-limit.tex', 'a.tex'], 10)]).toEqual([['longer-than-the-limit.tex'], ['a.tex']]);
		expect([...splitInChunks([], 10)]).toEqual([]);

		const names = Array.from({ length: 5000 }, (_, i) => `:(literal)${i}.tex`);
		const chunks = [...splitInChunks(names)];
		expect(chunks.flat()).toEqual(names);
		for (const chunk of chunks) expect(chunk.map((p) => `"${p}"`).join(' ').length).toBeLessThanOrEqual(MAX_CLI_LENGTH);
	});
});
