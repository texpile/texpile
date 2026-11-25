// the rows Ignore hid, kept in the folder's .texpile/config.json
import { projectConfigSync, projectIgnored } from '$lib/workspace/projectConfigSync.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { relativeInside } from '$lib/workspace/fileSystem';
import type { ProblemFilter } from './problemTypes';

// FNV-1a: a line of a paragraph-per-line .tex is too long to keep whole
function hashOf(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(16);
}

/** an edit to the line brings the row back */
export function ignoreKeyOf(filter: ProblemFilter, file: string | null, what: string, words: string, line: string): string {
	const root = workspaceRoot.current;
	const rel = (file && root && relativeInside(root, file)) || file || '';
	return `${filter}:${rel.replace(/\\/g, '/')}:${what}:${words}:${hashOf(line.trim())}`;
}

export function isIgnored(key: string | null): boolean {
	return key !== null && projectIgnored.current.includes(key);
}

export function ignoreProblem(key: string): void {
	if (isIgnored(key)) return;
	projectConfigSync.setIgnored(workspaceRoot.current, [...projectIgnored.current, key]);
}

export function unignoreProblem(key: string): void {
	projectConfigSync.setIgnored(
		workspaceRoot.current,
		projectIgnored.current.filter((k) => k !== key)
	);
}
