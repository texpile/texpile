// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. Ported from vscode src/vs/platform/files/common/watcher.ts
import * as path from 'node:path';

export type FileChangeKind = 'added' | 'updated' | 'deleted';

export type RawFileChange = { type: FileChangeKind; path: string };

const IGNORE_CASE = process.platform !== 'linux';

function isParent(child: string, candidate: string): boolean {
	if (!child || !candidate || child === candidate || candidate.length > child.length) return false;
	const prefix = candidate.endsWith(path.sep) ? candidate : candidate + path.sep;
	return IGNORE_CASE ? child.toLowerCase().startsWith(prefix.toLowerCase()) : child.startsWith(prefix);
}

class FileChangeCoalescer {
	private readonly coalesced = new Set<RawFileChange>();
	private readonly byPath = new Map<string, RawFileChange>();

	private keyOf(change: RawFileChange): string {
		return IGNORE_CASE ? change.path.toLowerCase() : change.path;
	}

	process(change: RawFileChange): void {
		const existing = this.byPath.get(this.keyOf(change));
		let keep = false;
		if (existing) {
			if (existing.path !== change.path && (change.type === 'deleted' || change.type === 'added')) keep = true;
			else if (existing.type === 'added' && change.type === 'deleted') {
				this.byPath.delete(this.keyOf(change));
				this.coalesced.delete(existing);
			} else if (existing.type === 'deleted' && change.type === 'added') existing.type = 'updated';
			else if (existing.type === 'added' && change.type === 'updated') {
				// a file created and then written stays created
			} else existing.type = change.type;
		} else keep = true;
		if (keep) {
			const copy = { ...change };
			this.coalesced.add(copy);
			this.byPath.set(this.keyOf(copy), copy);
		}
	}

	coalesce(): RawFileChange[] {
		const addedOrUpdated: RawFileChange[] = [];
		const deletedPaths: string[] = [];
		return [...this.coalesced]
			.filter((c) => {
				if (c.type !== 'deleted') addedOrUpdated.push(c);
				return c.type === 'deleted';
			})
			.sort((a, b) => a.path.length - b.path.length)
			.filter((c) => {
				if (deletedPaths.some((deleted) => isParent(c.path, deleted))) return false;
				deletedPaths.push(c.path);
				return true;
			})
			.concat(addedOrUpdated);
	}
}

export function coalesceChanges(changes: RawFileChange[]): RawFileChange[] {
	const coalescer = new FileChangeCoalescer();
	for (const change of changes) coalescer.process(change);
	return coalescer.coalesce();
}
