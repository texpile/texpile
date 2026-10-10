import { statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore, texpilePath } from '$lib/workspace/texpileDir';
import { packageFileFrom } from '$lib/languages/latex/installedPackages';

/** a package file for an installed package, drafted from its .sty; its path, or null when TeX has no such package */
export async function savePackageFile(root: string, name: string): Promise<string | null> {
	const path = texpilePath(root, `packages/${name}.json`);
	if (!path) return null;
	// one already there is the reader's own, never written over
	if ((await statFile(path)).exists) return path;
	const source = await globalThis.window?.texpileTypst?.texPackage?.(`${name}.sty`);
	if (!source) return null;
	await ensureTexpileIgnore(root);
	await writeTextFile(path, `${JSON.stringify(packageFileFrom(source), null, '\t')}\n`);
	return path;
}
