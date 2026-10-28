// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. Ported from vscode src/vs/platform/files/common/files.ts
import type { URI } from 'vscode-uri';
import { extUri } from '../identity/extUri';
import { ResourceSet } from '../identity/resourceMap';

export type FileChangeType = 'added' | 'updated' | 'deleted';

export type FileChange = { type: FileChangeType; resource: URI };

function anyBelow(resources: readonly URI[], parent: URI): boolean {
	return resources.some((r) => !extUri.isEqual(r, parent) && extUri.isEqualOrParent(r, parent));
}

export class FileChangesEvent {
	readonly rawAdded: URI[] = [];
	readonly rawUpdated: URI[] = [];
	readonly rawDeleted: URI[] = [];
	private readonly added: ResourceSet;
	private readonly updated: ResourceSet;

	constructor(changes: readonly FileChange[]) {
		for (const change of changes) {
			if (change.type === 'added') this.rawAdded.push(change.resource);
			else if (change.type === 'updated') this.rawUpdated.push(change.resource);
			else this.rawDeleted.push(change.resource);
		}
		this.added = new ResourceSet(this.rawAdded);
		this.updated = new ResourceSet(this.rawUpdated);
	}

	/** a deletion also matches when a parent folder was deleted */
	contains(resource: URI, ...types: FileChangeType[]): boolean {
		return this.doContains(resource, false, types);
	}

	/** matches the resource itself or anything below it */
	affects(resource: URI, ...types: FileChangeType[]): boolean {
		return this.doContains(resource, true, types);
	}

	private doContains(resource: URI, includeChildren: boolean, types: FileChangeType[]): boolean {
		function wants(type: FileChangeType): boolean {
			return types.length === 0 || types.includes(type);
		}
		if (wants('added') && (this.added.has(resource) || (includeChildren && anyBelow(this.rawAdded, resource)))) return true;
		if (wants('updated') && (this.updated.has(resource) || (includeChildren && anyBelow(this.rawUpdated, resource)))) return true;
		if (wants('deleted')) {
			if (this.rawDeleted.some((d) => extUri.isEqualOrParent(resource, d))) return true;
			if (includeChildren && anyBelow(this.rawDeleted, resource)) return true;
		}
		return false;
	}

	gotAdded(): boolean {
		return this.rawAdded.length > 0;
	}

	gotDeleted(): boolean {
		return this.rawDeleted.length > 0;
	}

	gotUpdated(): boolean {
		return this.rawUpdated.length > 0;
	}
}
