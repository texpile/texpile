// the one TeX Live build Texpile installs itself, and which of its archives fits this machine
import type { Libc } from '../install/linuxLibc';

export const TEXLIVE_VERSION = '2026-r81008';

export const TEXLIVE_YEAR = Number(TEXLIVE_VERSION.slice(0, 4));

// Texpile's own build (the vendor-texlive workflow; vendor/README.md)
const RELEASE_URL = `https://dl.texpile.com/vendor/texlive/${TEXLIVE_VERSION}/`;

/** TeX Live's own name for the folder under bin/ */
export type TexLivePlatform = 'x86_64-linux' | 'aarch64-linux' | 'universal-darwin' | 'windows';

// Copied from that version's SHA256SUMS, pinned here as for tinymist (tinymistRelease.ts). A version bump replaces
// TEXLIVE_VERSION and every line below together
const SHA256_BY_PLATFORM: Record<TexLivePlatform, string> = {
	'x86_64-linux': 'eb9e8de5f649f91e55a5540374701b488422ab08e50a97e3dec28326dc12a06f',
	'aarch64-linux': 'db4612439000f653bdf14ec56bebbc14958bacb0d2ff00a95d62d36ee19df191',
	'universal-darwin': '18418e5fee366eb904d7a49994dcbe53250b0aaea9b55b6ad8b2a6cb38d25983',
	windows: '978d3b53c050c774dd20b422011a44bbd8b086a20c858b700438e29b6bbc9c09'
};

// for the offer, before anything is downloaded
const MEGABYTES_BY_PLATFORM: Record<TexLivePlatform, number> = {
	'x86_64-linux': 175,
	'aarch64-linux': 180,
	'universal-darwin': 230,
	windows: 282
};

export type TexLiveAsset = {
	/** the archive's file name in the release, e.g. texlive-x86_64-linux.tar.xz */
	name: string;
	url: string;
	/** lowercase hex */
	sha256: string;
	format: 'zip' | 'tar.xz';
	platform: TexLivePlatform;
	megabytes: number;
};

/** the build that runs here, or null when Texpile has none for it */
export function texlivePlatform(platform: NodeJS.Platform, arch: string, libc: Libc): TexLivePlatform | null {
	// one Windows build: Windows on Arm runs its x64 programs
	if (platform === 'win32') return arch === 'x64' || arch === 'arm64' ? 'windows' : null;
	if (platform === 'darwin') return 'universal-darwin';
	if (platform !== 'linux' || libc !== 'gnu') return null;
	return arch === 'x64' ? 'x86_64-linux' : arch === 'arm64' ? 'aarch64-linux' : null;
}

export function texliveAssetFor(platform: NodeJS.Platform, arch: string, libc: Libc): TexLiveAsset | null {
	const tl = texlivePlatform(platform, arch, libc);
	if (!tl) return null;
	const format = tl === 'windows' ? 'zip' : 'tar.xz';
	const name = `texlive-${tl}.${format}`;
	return { name, url: RELEASE_URL + name, sha256: SHA256_BY_PLATFORM[tl], format, platform: tl, megabytes: MEGABYTES_BY_PLATFORM[tl] };
}
