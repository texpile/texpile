// where Texpile's own TeX Live lives
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { TexLivePlatform } from './texliveRelease';

// beside userData, except an installed Windows Texpile's, which roams: a domain profile copies it at every sign in
export function texliveRoot(userData: string, portable: boolean, platform = process.platform, env = process.env): string {
	if (platform !== 'win32') return path.join(userData, 'texlive');
	if (portable) return path.win32.join(userData, 'texlive');
	const local = env.LOCALAPPDATA || path.win32.join(os.homedir(), 'AppData', 'Local');
	return path.win32.join(local, path.win32.basename(userData), 'texlive');
}

export function texliveBin(root: string, platform: TexLivePlatform): string {
	return path.join(root, 'bin', platform);
}

const EXE = process.platform === 'win32' ? '.exe' : '';

/** the bin folder when the tree is there */
export function installedTexLiveBin(root: string, platform: TexLivePlatform | null): string | null {
	if (!platform) return null;
	const bin = texliveBin(root, platform);
	return fs.existsSync(path.join(bin, `lualatex${EXE}`)) ? bin : null;
}
