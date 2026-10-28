import { afterEach, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isMac: false, isWindows: false }));
vi.mock('$lib/platform', () => platform);

import { BufferKeys } from '$lib/buffers/bufferKeys';

afterEach(() => {
	platform.isWindows = false;
});

it('names a held file by its first spelling, so a second spelling reaches the same buffer', () => {
	platform.isWindows = true;
	const keys = new BufferKeys();
	keys.remember('Chapters/Intro.tex');
	expect(keys.canonical('chapters\\intro.tex')).toBe('Chapters/Intro.tex');
	keys.forget('Chapters/Intro.tex');
	expect(keys.canonical('chapters/intro.tex')).toBe('chapters/intro.tex');
});
