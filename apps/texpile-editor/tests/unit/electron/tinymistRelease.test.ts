import { describe, it, expect } from 'vitest';
import { linuxLibc, tinymistAssetFor, TINYMIST_VERSION } from '../../../../../electron/src/tinymist/tinymistRelease';
import { tarCommand } from '../../../../../electron/src/tinymist/tinymistArchive';

// Texpile's signed copy, laid out as the release is
const RELEASE = `https://dl.texpile.com/vendor/tinymist/${TINYMIST_VERSION}/`;

describe('tinymistAssetFor', () => {
	// the archive names as the release publishes them (dist-manifest.json of the pinned version)
	const CASES: [NodeJS.Platform, string, 'gnu' | 'musl', string][] = [
		['win32', 'x64', 'gnu', 'tinymist-x86_64-pc-windows-msvc.zip'],
		['win32', 'arm64', 'gnu', 'tinymist-aarch64-pc-windows-msvc.zip'],
		['darwin', 'arm64', 'gnu', 'tinymist-aarch64-apple-darwin.tar.gz'],
		['darwin', 'x64', 'gnu', 'tinymist-x86_64-apple-darwin.tar.gz'],
		['linux', 'x64', 'gnu', 'tinymist-x86_64-unknown-linux-gnu.tar.gz'],
		['linux', 'x64', 'musl', 'tinymist-x86_64-unknown-linux-musl.tar.gz'],
		['linux', 'arm64', 'gnu', 'tinymist-aarch64-unknown-linux-gnu.tar.gz'],
		['linux', 'arm64', 'musl', 'tinymist-aarch64-unknown-linux-musl.tar.gz']
	];

	for (const [platform, arch, libc, name] of CASES) {
		it(`picks ${name} for ${platform} ${arch}${platform === 'linux' ? ` ${libc}` : ''}`, () => {
			const asset = tinymistAssetFor(platform, arch, libc);
			expect(asset?.name).toBe(name);
			expect(asset?.url).toBe(RELEASE + name);
			expect(asset?.format).toBe(platform === 'win32' ? 'zip' : 'tar.gz');
			expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);
		});
	}

	it('pins a different checksum for every archive', () => {
		const sums = CASES.map(([p, a, l]) => tinymistAssetFor(p, a, l)?.sha256);
		expect(new Set(sums).size).toBe(CASES.length);
	});

	it('ignores the C library off Linux', () => {
		expect(tinymistAssetFor('darwin', 'arm64', 'musl')).toEqual(tinymistAssetFor('darwin', 'arm64', 'gnu'));
		expect(tinymistAssetFor('win32', 'x64', 'musl')).toEqual(tinymistAssetFor('win32', 'x64', 'gnu'));
	});

	it('has nothing for a machine the release does not build for', () => {
		expect(tinymistAssetFor('win32', 'ia32', 'gnu')).toBeNull();
		expect(tinymistAssetFor('linux', 'arm', 'gnu')).toBeNull();
		expect(tinymistAssetFor('freebsd', 'x64', 'gnu')).toBeNull();
	});
});

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

describe('tarCommand', () => {
	// a GNU tar from Git for Windows earlier on PATH cannot read the zip
	it("names Windows' own tar by absolute path", () => {
		expect(tarCommand('win32', { SystemRoot: 'D:\\Win' })).toBe('D:\\Win\\System32\\tar.exe');
		expect(tarCommand('win32', {})).toBe('C:\\Windows\\System32\\tar.exe');
	});

	it('uses the tar on PATH elsewhere', () => {
		expect(tarCommand('darwin', {})).toBe('tar');
		expect(tarCommand('linux', {})).toBe('tar');
	});
});
