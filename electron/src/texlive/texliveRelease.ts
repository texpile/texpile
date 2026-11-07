// the one TeX Live build Texpile installs itself, and which of its archives fits this machine
import type { Libc } from '../install/linuxLibc';

export const TEXLIVE_VERSION = '2026-r81008-eec2f0';

export const TEXLIVE_YEAR = Number(TEXLIVE_VERSION.slice(0, 4));

// Texpile's own build (the vendor-texlive workflow; vendor/README.md)
const RELEASE_URL = `https://dl.texpile.com/vendor/texlive/${TEXLIVE_VERSION}/`;

// where tlmgr finds the year's packages once the next release has taken over mirror.ctan.org
export const TEXLIVE_FINAL_REPOSITORY = `https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/${TEXLIVE_YEAR}/tlnet-final`;

/** TeX Live's own name for the folder under bin/ */
export type TexLivePlatform = 'x86_64-linux' | 'aarch64-linux' | 'universal-darwin' | 'windows';

// Copied from that version's SHA256SUMS, pinned here as for tinymist (tinymistRelease.ts). A version bump replaces
// TEXLIVE_VERSION and every line below together
const SHA256_BY_PLATFORM: Record<TexLivePlatform, string> = {
	'x86_64-linux': 'de3c2890a10fef8a8298ac9956439a62d4308a23b3e50fcd5894e2c504ee8d99',
	'aarch64-linux': '8de8612d11925094b21192e07d3b742b178020dcbcfc44a462a641f3b597d3eb',
	'universal-darwin': 'a4d5f0010dd4d61eb9bb5232b049fcdbd25bd45a40c1d9350404f91061ff114e',
	windows: '9921b769a69437f005daea9aa62f06b4d47d173cd1c8b0980004d9c18366212c'
};

// for the offer, before anything is downloaded
const MEGABYTES_BY_PLATFORM: Record<TexLivePlatform, number> = {
	'x86_64-linux': 174,
	'aarch64-linux': 180,
	'universal-darwin': 230,
	windows: 287
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
