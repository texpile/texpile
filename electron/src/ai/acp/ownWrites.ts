// Texpile's own saves, told to whoever has to tell them apart from an agent's: what the reader typed while a
// turn ran is not the agent's change, and Revert must not take it back
type OwnWriteListener = (path: string, text: string) => void;

const listeners = new Set<OwnWriteListener>();

export function onOwnWrite(listener: OwnWriteListener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function noteOwnWrite(path: string, text: string): void {
	for (const listener of listeners) listener(path, text);
}
