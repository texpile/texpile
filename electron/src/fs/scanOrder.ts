import { collator } from './nameCollator';

function depth(relPath: string): number {
	return relPath.split(/[\\/]/).length;
}

export function byScanOrder(a: { relPath: string }, b: { relPath: string }): number {
	return depth(a.relPath) - depth(b.relPath) || collator.compare(a.relPath, b.relPath);
}
