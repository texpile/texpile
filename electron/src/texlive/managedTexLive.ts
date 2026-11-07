// Texpile's own TeX Live on this machine
import { app } from 'electron';
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
