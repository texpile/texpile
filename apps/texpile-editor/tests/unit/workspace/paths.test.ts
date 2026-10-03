import { describe, it, expect, afterEach, vi } from 'vitest';
import { normalizePath, underRoot, joinPath } from '$lib/workspace/fileSystem';

const platform = vi.hoisted(() => ({ isMac: false, isWindows: false }));
vi.mock('$lib/platform', () => platform);
afterEach(() => {
	platform.isWindows = false;
});

describe('normalizePath', () => {
	it('collapses . and .. segments', () => {
		expect(normalizePath('session/sub/../lib.tex')).toBe('session/lib.tex');
		expect(normalizePath('a/./b/c/../../d')).toBe('a/d');
	});

	it('keeps a .. that climbs past the first segment, so escapes stay visible', () => {
		expect(normalizePath('session/sub/../../../x.tex')).toBe('../x.tex');
		expect(normalizePath('../x')).toBe('../x');
	});

	it('never pops a drive or absolute root; the stranded .. stays visible', () => {
		expect(normalizePath('C:\\ws\\..\\..\\x')).toBe('C:\\..\\x');
		expect(normalizePath('/a/../../x')).toBe('/../x');
	});
});

describe('underRoot', () => {
	it('accepts the root itself and its descendants, across separators and, on Windows, case', () => {
		platform.isWindows = true;
		expect(underRoot('C:\\ws', 'C:\\ws\\sub\\f.tex')).toBe(true);
		expect(underRoot('C:\\ws', 'c:/WS/f.tex')).toBe(true);
		expect(underRoot('session', 'session')).toBe(true);
	});

	it('rejects escapes and lookalike prefixes', () => {
		expect(underRoot('session', 'sessions/x.tex')).toBe(false);
		expect(underRoot('C:\\ws', 'C:\\other\\f.tex')).toBe(false);
		// the guest jump path: a ../../ link normalized out of the synthetic root
		expect(underRoot('session', normalizePath(joinPath('session/sub', '../../x.tex')))).toBe(false);
	});
});
