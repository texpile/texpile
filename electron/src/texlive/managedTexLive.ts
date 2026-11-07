// Texpile's own TeX Live on this machine
import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findProgram } from '../shell/findProgram';
import { portable } from '../appIdentity';
import { currentLibc } from '../install/linuxLibc';
import { installedTexLiveBin, texliveRoot } from './texliveDir';
import { texliveAssetFor, texlivePlatform, type TexLiveAsset } from './texliveRelease';

export function managedTexLiveRoot(): string {
	return texliveRoot(app.getPath('userData'), portable);
}

export function managedTexLiveAsset(): TexLiveAsset | null {
	return texliveAssetFor(process.platform, process.arch, currentLibc());
}

/** its bin folder once installed; a tree that is there was built for this machine, so the C library is not asked */
export function managedTexLiveBin(): string | null {
	return installedTexLiveBin(managedTexLiveRoot(), texlivePlatform(process.platform, process.arch, 'gnu'));
}

function real(p: string): string {
	try {
		return fs.realpathSync(p);
	} catch {
		return p;
	}
}

/** the lualatex PATH reaches is Texpile's own; call after shellEnvReady */
export function texInUseIsManaged(): boolean {
	const lualatex = findProgram('lualatex');
	if (!lualatex) return false;
	const rel = path.relative(real(managedTexLiveRoot()), real(lualatex));
	return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}
