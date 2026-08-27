import { describe, it, expect, beforeEach } from 'vitest';
import { visualDocCache } from '$lib/workspace/visualDocCache';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';

function parsed(marker: string): ParsedLatexFile {
	return { preamble: marker, postamble: '', doc: { marker } as never, hadDocumentEnv: true, warnings: [] };
}

beforeEach(() => {
	visualDocCache.clear();
});

describe('visualDocCache', () => {
	it('returns the document only for the exact text it was parsed from', () => {
		visualDocCache.set('/proj/a.tex', 'hello', parsed('a'));

		expect(visualDocCache.get('/proj/a.tex', 'hello')).toEqual(parsed('a'));
		expect(visualDocCache.get('/proj/a.tex', 'hello world')).toBeNull();
	});

	it('drops the entry once the text has moved on, so a later miss cannot resurrect it', () => {
		visualDocCache.set('/proj/a.tex', 'hello', parsed('a'));
		visualDocCache.get('/proj/a.tex', 'edited');

		expect(visualDocCache.get('/proj/a.tex', 'hello')).toBeNull();
	});

	it('matches a path written with either separator or casing', () => {
		visualDocCache.set('C:\\proj\\a.tex', 'hello', parsed('a'));

		expect(visualDocCache.get('C:/Proj/A.tex', 'hello')).toEqual(parsed('a'));
	});

	it('evicts the least recently used, counting a read as use', () => {
		for (let i = 0; i < 8; i++) visualDocCache.set(`/proj/f${i}.tex`, 'x', parsed(`f${i}`));
		visualDocCache.get('/proj/f0.tex', 'x'); // f1 is now the coldest
		visualDocCache.set('/proj/new.tex', 'x', parsed('new'));

		expect(visualDocCache.get('/proj/f0.tex', 'x')).toEqual(parsed('f0'));
		expect(visualDocCache.get('/proj/f1.tex', 'x')).toBeNull();
	});

	it('forgets a deleted folder along with the files under it', () => {
		visualDocCache.set('/proj/sub/a.tex', 'x', parsed('a'));
		visualDocCache.set('/proj/other.tex', 'x', parsed('other'));

		visualDocCache.forget('/proj/sub');

		expect(visualDocCache.get('/proj/sub/a.tex', 'x')).toBeNull();
		expect(visualDocCache.get('/proj/other.tex', 'x')).toEqual(parsed('other'));
	});

	it('carries entries across a folder rename', () => {
		visualDocCache.set('/proj/sub/a.tex', 'x', parsed('a'));

		visualDocCache.rename('/proj/sub', '/proj/moved');

		expect(visualDocCache.get('/proj/moved/a.tex', 'x')).toEqual(parsed('a'));
		expect(visualDocCache.get('/proj/sub/a.tex', 'x')).toBeNull();
	});
});
