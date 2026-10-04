// Texpile's own saves and file operations, told to whoever has to tell them apart from an agent's: what the reader
// typed, deleted or renamed while a turn ran is not the agent's change, and Revert must not take it back
import type { FsOpBody } from '../../fs/fsService';

type OwnWriteListener = (path: string, text: string) => void;
/** a file or a folder Texpile removed, renamed, or added: made, copied in, or brought back by an undo */
export type OwnFileOp = { kind: 'remove'; path: string } | { kind: 'add'; path: string } | { kind: 'move'; path: string; to: string };
type OwnFileOpListener = (op: OwnFileOp) => void;

const listeners = new Set<OwnWriteListener>();
const opListeners = new Set<OwnFileOpListener>();

export function onOwnWrite(listener: OwnWriteListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function noteOwnWrite(path: string, text: string): void {
	for (const listener of listeners) listener(path, text);
}

export function onOwnFileOp(listener: OwnFileOpListener): () => void {
	opListeners.add(listener);
	return () => opListeners.delete(listener);
}

function ownFileOp({ action, path, from, to }: FsOpBody): OwnFileOp | null {
	if (action === 'delete' && path) return { kind: 'remove', path };
	if (action === 'create' && path) return { kind: 'add', path };
	if (action === 'rename' && from && to) return { kind: 'move', path: from, to };
	if ((action === 'restore' || action === 'copy') && to) return { kind: 'add', path: to };
	return null;
}

/** an fs:op that has landed */
export function noteOwnFileOp(body: FsOpBody): void {
	const op = ownFileOp(body);
	if (op) for (const listener of opListeners) listener(op);
}
