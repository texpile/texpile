import { describe, it, expect } from 'vitest';
import { texliveAssetFor, TEXLIVE_VERSION } from '../../../../../../electron/src/texlive/texliveRelease';

describe('texliveAssetFor', () => {
	// the archive names as the vendor-texlive workflow publishes them
	const CASES: [NodeJS.Platform, string, string][] = [
		['linux', 'x64', 'texlive-x86_64-linux.tar.xz'],
		['linux', 'arm64', 'texlive-aarch64-linux.tar.xz'],
		['darwin', 'arm64', 'texlive-universal-darwin.tar.xz'],
		['darwin', 'x64', 'texlive-universal-darwin.tar.xz'],
		['win32', 'x64', 'texlive-windows.zip'],
		['win32', 'arm64', 'texlive-windows.zip']
	];

	for (const [platform, arch, name] of CASES) {
		it(`picks ${name} for ${platform} ${arch}`, () => {
			const asset = texliveAssetFor(platform, arch, 'gnu');
			expect(asset?.url).toBe(`https://dl.texpile.com/vendor/texlive/${TEXLIVE_VERSION}/${name}`);
			expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);
		});
	}

	it('has nothing where LuaTeX would not run', () => {
		expect(texliveAssetFor('linux', 'x64', 'musl')).toBeNull();
		expect(texliveAssetFor('win32', 'ia32', 'gnu')).toBeNull();
		expect(texliveAssetFor('freebsd', 'x64', 'gnu')).toBeNull();
	});
});
