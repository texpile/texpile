// the one tinymist release Texpile installs itself, and which of its archives fits this machine
import type { Libc } from '../install/linuxLibc';

export const TINYMIST_VERSION = '0.15.8';

// Texpile's own copy of the release, its Windows and macOS programs signed by Texpile LLC (the
// vendor-tinymist workflow; vendor/README.md): an unsigned program in Texpile's folder is what a
// virus scanner flags, and the warning would name Texpile
const RELEASE_URL = `https://dl.texpile.com/vendor/tinymist/${TINYMIST_VERSION}/`;

// Copied from that copy's SHA256SUMS; the Linux archives are tinymist's own and keep its hashes.
// Pinned here rather than fetched next to the archive: a checksum from the same place as the
// download only proves the two agree, not that the archive is the one this version of Texpile was
// tested with. A version bump replaces TINYMIST_VERSION and every line below together.
const SHA256_BY_TARGET: Record<string, string> = {
	'x86_64-pc-windows-msvc': '8f4dfbab02a1dbbc4fa6952aaf5a91dc74f9077c540cb37fa060cf926422e590',
	'aarch64-pc-windows-msvc': '24ce22811709f46c9bc8fcd152230a866a4f517a2071379fea86ec049f8a4e81',
	'aarch64-apple-darwin': '6f2b494ce9fe9b9dc5ea0ec53141cdaa032743abe0c338433d5911b84cc9fb6a',
	'x86_64-apple-darwin': '955cb99fd3aaab0c38625083bb23b070e155341ea2ffe58461172632cbfa1632',
	'x86_64-unknown-linux-gnu': '2428932e8d8b593ebc1ac4eed41fb9d3584166e1044bbcdef740b7296c348295',
	'x86_64-unknown-linux-musl': '816d33895ae343f934403dbd73f687a531368464450451510f3c108b0c04bcfd',
	'aarch64-unknown-linux-gnu': 'ec78300e89b34e0958b615b1d42c275fd11bf91d2d27401bbef07150e477f199',
	'aarch64-unknown-linux-musl': '8055377bfd463c05dc7e9cf4116d355ba0c2bb80a68a583b31905830f2d311eb'
};

export type TinymistAsset = {
	/** the archive's file name in the release, e.g. tinymist-x86_64-unknown-linux-gnu.tar.gz */
	name: string;
	url: string;
	/** lowercase hex */
	sha256: string;
	format: 'zip' | 'tar.gz';
};

/** the release's name for this machine (a Rust target triple), or null when it publishes no build for it */
export function tinymistTarget(platform: NodeJS.Platform, arch: string, libc: Libc): string | null {
	const cpu = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : null;
	if (!cpu) return null;
	if (platform === 'win32') return `${cpu}-pc-windows-msvc`;
	if (platform === 'darwin') return `${cpu}-apple-darwin`;
	if (platform === 'linux') return `${cpu}-unknown-linux-${libc}`;
	return null;
}

export function tinymistAssetFor(platform: NodeJS.Platform, arch: string, libc: Libc): TinymistAsset | null {
	const target = tinymistTarget(platform, arch, libc);
	const sha256 = target ? SHA256_BY_TARGET[target] : undefined;
	if (!target || !sha256) return null;
	const format = platform === 'win32' ? 'zip' : 'tar.gz';
	const name = `tinymist-${target}.${format}`;
	return { name, url: RELEASE_URL + name, sha256, format };
}
