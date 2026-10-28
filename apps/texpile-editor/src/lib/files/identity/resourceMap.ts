// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. Ported from vscode src/vs/base/common/map.ts
import type { URI } from 'vscode-uri';
import { extUri } from './extUri';

type ResourceKeyFn = (resource: URI) => string;

function comparisonKey(resource: URI): string {
	return extUri.getComparisonKey(resource);
}

export class ResourceMap<T> {
	readonly [Symbol.toStringTag] = 'ResourceMap';
	private readonly map = new Map<string, { uri: URI; value: T }>();

	constructor(
		entries: Iterable<readonly [URI, T]> = [],
		private readonly toKey: ResourceKeyFn = comparisonKey
	) {
		for (const [resource, value] of entries) this.set(resource, value);
	}

	set(resource: URI, value: T): this {
		this.map.set(this.toKey(resource), { uri: resource, value });
		return this;
	}

	get(resource: URI): T | undefined {
		return this.map.get(this.toKey(resource))?.value;
	}

	has(resource: URI): boolean {
		return this.map.has(this.toKey(resource));
	}

	get size(): number {
		return this.map.size;
	}

	clear(): void {
		this.map.clear();
	}

	delete(resource: URI): boolean {
		return this.map.delete(this.toKey(resource));
	}

	forEach(callback: (value: T, key: URI, map: ResourceMap<T>) => void): void {
		for (const entry of this.map.values()) callback(entry.value, entry.uri, this);
	}

	*values(): MapIterator<T> {
		for (const entry of this.map.values()) yield entry.value;
	}

	*keys(): MapIterator<URI> {
		for (const entry of this.map.values()) yield entry.uri;
	}

	*entries(): MapIterator<[URI, T]> {
		for (const entry of this.map.values()) yield [entry.uri, entry.value];
	}

	[Symbol.iterator](): MapIterator<[URI, T]> {
		return this.entries();
	}
}

export class ResourceSet {
	readonly [Symbol.toStringTag] = 'ResourceSet';
	private readonly map: ResourceMap<URI>;

	constructor(entries: Iterable<URI> = [], toKey: ResourceKeyFn = comparisonKey) {
		this.map = new ResourceMap<URI>([], toKey);
		for (const resource of entries) this.add(resource);
	}

	get size(): number {
		return this.map.size;
	}

	add(resource: URI): this {
		this.map.set(resource, resource);
		return this;
	}

	clear(): void {
		this.map.clear();
	}

	delete(resource: URI): boolean {
		return this.map.delete(resource);
	}

	has(resource: URI): boolean {
		return this.map.has(resource);
	}

	forEach(callback: (value: URI, key: URI, set: ResourceSet) => void): void {
		for (const resource of this.map.keys()) callback(resource, resource, this);
	}

	*entries(): SetIterator<[URI, URI]> {
		for (const resource of this.map.keys()) yield [resource, resource];
	}

	keys(): SetIterator<URI> {
		return this.map.keys();
	}

	values(): SetIterator<URI> {
		return this.map.keys();
	}

	[Symbol.iterator](): SetIterator<URI> {
		return this.keys();
	}
}
