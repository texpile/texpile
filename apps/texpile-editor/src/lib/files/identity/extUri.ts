// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. Ported from vscode src/vs/base/common/resources.ts
import { URI, Utils } from 'vscode-uri';
import { isMac, isWindows } from '$lib/platform';

const SLASH = '/';

function equalsIgnoreCase(a: string, b: string): boolean {
	return a.length === b.length && a.toLowerCase() === b.toLowerCase();
}

function isEqualOrParentPath(base: string, parentCandidate: string, ignoreCase: boolean): boolean {
	if (base === parentCandidate) return true;
	if (!base || !parentCandidate || parentCandidate.length > base.length) return false;
	if (ignoreCase) {
		if (!base.toLowerCase().startsWith(parentCandidate.toLowerCase())) return false;
		if (parentCandidate.length === base.length) return true;
		const sepOffset = parentCandidate.endsWith(SLASH) ? parentCandidate.length - 1 : parentCandidate.length;
		return base.charAt(sepOffset) === SLASH;
	}
	return base.startsWith(parentCandidate.endsWith(SLASH) ? parentCandidate : parentCandidate + SLASH);
}

function relativePosixPath(from: string, to: string): string {
	const fromParts = from.split(SLASH).filter(Boolean);
	const toParts = to.split(SLASH).filter(Boolean);
	let common = 0;
	while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common++;
	return [...fromParts.slice(common).map(() => '..'), ...toParts.slice(common)].join(SLASH);
}

export class ExtUri {
	constructor(private readonly ignoreCaseOf: (uri: URI) => boolean) {}

	compare(uri1: URI, uri2: URI, ignoreFragment = false): number {
		if (uri1 === uri2) return 0;
		const a = this.getComparisonKey(uri1, ignoreFragment);
		const b = this.getComparisonKey(uri2, ignoreFragment);
		return a < b ? -1 : a > b ? 1 : 0;
	}

	isEqual(uri1: URI | undefined, uri2: URI | undefined, ignoreFragment = false): boolean {
		if (uri1 === uri2) return true;
		if (!uri1 || !uri2) return false;
		return this.getComparisonKey(uri1, ignoreFragment) === this.getComparisonKey(uri2, ignoreFragment);
	}

	getComparisonKey(uri: URI, ignoreFragment = false): string {
		return uri
			.with({ path: this.ignoreCaseOf(uri) ? uri.path.toLowerCase() : undefined, fragment: ignoreFragment ? null : undefined })
			.toString();
	}

	ignorePathCasing(uri: URI): boolean {
		return this.ignoreCaseOf(uri);
	}

	isEqualOrParent(base: URI, parentCandidate: URI, ignoreFragment = false): boolean {
		if (base.scheme !== parentCandidate.scheme || !this.isEqualAuthority(base.authority, parentCandidate.authority)) return false;
		if (!isEqualOrParentPath(base.path, parentCandidate.path, this.ignoreCaseOf(base))) return false;
		return base.query === parentCandidate.query && (ignoreFragment || base.fragment === parentCandidate.fragment);
	}

	relativePath(from: URI, to: URI): string | undefined {
		if (from.scheme !== to.scheme || !this.isEqualAuthority(from.authority, to.authority)) return undefined;
		let fromPath = from.path || SLASH;
		const toPath = to.path || SLASH;
		if (this.ignoreCaseOf(from)) {
			let i = 0;
			for (const len = Math.min(fromPath.length, toPath.length); i < len; i++) {
				if (fromPath.charCodeAt(i) !== toPath.charCodeAt(i) && fromPath.charAt(i).toLowerCase() !== toPath.charAt(i).toLowerCase()) break;
			}
			fromPath = toPath.slice(0, i) + fromPath.slice(i);
		}
		return relativePosixPath(fromPath, toPath);
	}

	joinPath(resource: URI, ...pathFragment: string[]): URI {
		return Utils.joinPath(resource, ...pathFragment);
	}

	basename(resource: URI): string {
		return Utils.basename(resource);
	}

	extname(resource: URI): string {
		return Utils.extname(resource);
	}

	dirname(resource: URI): URI {
		return resource.path.length === 0 ? resource : Utils.dirname(resource);
	}

	isEqualAuthority(a1: string | undefined, a2: string | undefined): boolean {
		return a1 === a2 || (a1 !== undefined && a2 !== undefined && equalsIgnoreCase(a1, a2));
	}
}

const FILE_LIKE_SCHEMES = new Set(['file', 'git', 'history', 'agent']);

export const extUri = new ExtUri((uri) => (isWindows || isMac) && FILE_LIKE_SCHEMES.has(uri.scheme));
