import { URI } from 'vscode-uri';
import { extUri } from './extUri';

export function fileUriOf(path: string): URI {
	return URI.file(path.replace(/\\/g, '/'));
}

/** separators unified, case folded where the file system folds it; still a path */
export function fileIdentityKey(path: string): string {
	const unified = path.replace(/\\/g, '/');
	return extUri.ignorePathCasing(fileUriOf(unified)) ? unified.toLowerCase() : unified;
}

export function isSameFile(a: string, b: string): boolean {
	return a === b || fileIdentityKey(a) === fileIdentityKey(b);
}

export function isFileInside(root: string, path: string): boolean {
	return extUri.isEqualOrParent(fileUriOf(path), fileUriOf(root));
}

/** forward slashes, keeping `path`'s own casing; null when `path` is not strictly below `root` */
export function pathBelow(root: string, path: string): string | null {
	const base = fileUriOf(root.replace(/[\\/]+$/, ''));
	const target = fileUriOf(path.replace(/[\\/]+$/, ''));
	if (extUri.isEqual(base, target) || !extUri.isEqualOrParent(target, base)) return null;
	return extUri.relativePath(base, target) ?? null;
}
