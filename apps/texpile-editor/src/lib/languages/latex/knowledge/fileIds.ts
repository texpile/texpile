// a package use's name (amsmath, class-article, tikzlibrarycalc) and the id of the file that describes it
import { bundledIds } from './bundledFiles';

const LIBRARY_PREFIXES = [...new Set(bundledIds().flatMap((id) => (id.startsWith('libraries/') ? [id.split('/')[1]] : [])))].sort(
	(a, b) => b.length - a.length
);

export const KERNEL_ID = 'kernel/latex';

/** what counts as loaded in a file whose packages are unknown */
export const BASE_ID = 'texpile/ctan-base';

export function fileIdOf(useName: string): string {
	if (useName === 'latex-document') return KERNEL_ID;
	if (useName.startsWith('texpile/')) return useName;
	if (useName.startsWith('class-')) return `classes/${useName.slice(6)}`;
	for (const p of LIBRARY_PREFIXES)
		if (useName.startsWith(p) && useName.length > p.length) return `libraries/${p}/${useName.slice(p.length)}`;
	return `packages/${useName}`;
}

export function useNameOf(fileId: string): string {
	const [kind, a, b] = fileId.split('/');
	if (kind === 'kernel') return 'latex-document';
	if (kind === 'texpile') return fileId;
	if (kind === 'classes') return `class-${a}`;
	if (kind === 'libraries') return `${a}${b}`;
	return a;
}
