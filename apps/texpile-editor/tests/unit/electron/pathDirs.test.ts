import { it, expect } from 'vitest';
import { withPathDirs } from '../../../../../electron/src/shell/pathDirs';

const SEP = process.platform === 'win32' ? ';' : ':';

it('puts listed folders in front of PATH, so they win', () => {
	expect(withPathDirs({ PATH: ['/usr/bin', '/bin'].join(SEP) }, ['/opt/tex/bin']).PATH).toBe(
		['/opt/tex/bin', '/usr/bin', '/bin'].join(SEP)
	);
});

// the terminal's fallback to Texpile's own tinymist: a copy of the user's own must still come first
it('puts a fallback folder behind everything already on PATH', () => {
	expect(withPathDirs({ PATH: ['/usr/bin', '/bin'].join(SEP) }, ['/data/tinymist'], true).PATH).toBe(
		['/usr/bin', '/bin', '/data/tinymist'].join(SEP)
	);
});

it('leaves a folder already on PATH where it is', () => {
	const path = ['/data/tinymist', '/usr/bin'].join(SEP);
	expect(withPathDirs({ PATH: path }, ['/data/tinymist'], true).PATH).toBe(path);
});
