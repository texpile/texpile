import { describe, it, expect } from 'vitest';
import { linuxLibc } from '../../../../../../electron/src/install/linuxLibc';

describe('linuxLibc', () => {
	it('takes the gnu build on a glibc new enough for it', () => {
		expect(linuxLibc('2.28')).toBe('gnu');
		expect(linuxLibc('2.39')).toBe('gnu');
		expect(linuxLibc('3.0')).toBe('gnu');
	});

	it('falls back to the static musl build on an old glibc or none', () => {
		expect(linuxLibc('2.27')).toBe('musl');
		expect(linuxLibc('1.99')).toBe('musl');
		expect(linuxLibc(undefined)).toBe('musl');
		expect(linuxLibc('')).toBe('musl');
	});
});
