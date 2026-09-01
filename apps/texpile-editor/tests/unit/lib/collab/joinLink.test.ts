// Pasting a join link used to fall through to normalizeShareCode, which stripped the URL to its
// letters and produced a full-length code that was simply wrong ("HTTPS-JOINT-EXPIL-...").
import { describe, it, expect } from 'vitest';
import { codeFromJoinLink, joinLinkFor } from '$lib/collab/joinLink.svelte';

const CODE = 'ABCDE-FGHJK-MNPQR-STVWX-YZ234-5';
const RAW = 'ABCDEFGHJKMNPQRSTVWXYZ2345';

describe('codeFromJoinLink', () => {
	it('resolves the code out of a link, with or without a protocol', () => {
		expect(codeFromJoinLink(joinLinkFor(CODE))).toBe(RAW);
		expect(codeFromJoinLink('join.texpile.com/#' + CODE)).toBe(RAW);
		expect(codeFromJoinLink('http://127.0.0.1:5174/#' + CODE)).toBe(RAW);
		// the desktop scheme uses a path, not a fragment: some OS handoffs drop everything after #
		expect(codeFromJoinLink('texpile://join/' + CODE)).toBe(RAW);
	});

	// anything it does not recognise has to fall through, or typing a code by hand breaks
	it('declines a bare code, a partial one, and a link with no code in it', () => {
		expect(codeFromJoinLink(CODE)).toBe('');
		expect(codeFromJoinLink('https://join.texpile.com/#ABCDE')).toBe('');
		expect(codeFromJoinLink('https://join.texpile.com/')).toBe('');
	});
});
