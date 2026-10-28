import { describe, expect, it } from 'vitest';
import { versionUriOf } from '$lib/files/identity/versionUris';

describe('versionUriOf', () => {
	it('names each kind of old version by its own scheme, a commit with the name the file had then', () => {
		const git = versionUriOf('/p/main.tex', { hash: 'abc123', path: 'old.tex' });
		expect([git.scheme, git.path, JSON.parse(git.query)]).toEqual(['git', '/p/main.tex', { ref: 'abc123', path: 'old.tex' }]);
		expect(versionUriOf('/p/main.tex', { hash: 'local:Xy3.tex' }).toString(true)).toBe('history:/p/main.tex?Xy3.tex');
		expect(versionUriOf('/p/main.tex', { hash: 'agent:4:main.tex' }).toString(true)).toBe('agent:/p/main.tex?4:main.tex');
	});
});
