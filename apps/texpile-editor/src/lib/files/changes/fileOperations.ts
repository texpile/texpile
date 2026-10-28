// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT License. Ported from vscode src/vs/platform/files/common/files.ts
import type { URI } from 'vscode-uri';
import { extUri } from '../identity/extUri';
import { fileUriOf } from '../identity/fileUris';

export type FileOperation = 'create' | 'delete' | 'move' | 'copy' | 'write';

export class FileOperationEvent {
	constructor(
		readonly resource: URI,
		readonly operation: FileOperation,
		readonly target?: URI
	) {}

	isOperation(operation: FileOperation): boolean {
		return this.operation === operation;
	}

	/** a move of this file or of a folder above it */
	moves(path: string): boolean {
		return this.operation === 'move' && extUri.isEqualOrParent(fileUriOf(path), this.resource);
	}
}
