import { statFile, writeTextFile } from '$lib/workspace/fileSystem';
import { ensureTexpileIgnore, texpilePath } from '$lib/workspace/texpileDir';
import { packageFileFrom } from '$lib/languages/latex/installedPackages';
import { probeTexPackage } from './snippetLoader';

/** drafted from what the reader's TeX reports for the package; null when TeX has no such package */
export async function savePackageFile(root: string, name: string): Promise<string | null> {
	const path = texpilePath(root, `packages/${name}.json`);
	if (!path) return null;
	// one already there is the reader's own, never written over
	if ((await statFile(path)).exists) return path;
	const probe = await probeTexPackage(name);
	if (!probe) return null;
	await ensureTexpileIgnore(root);
	await writeTextFile(path, `${JSON.stringify(packageFileFrom(probe), null, '\t')}\n`);
	return path;
}
