// when a source editor has to be built again: its file, the session, and the shared text it binds to. Another file
// getting its buffer moves the session's manifest along, and must not rebuild every source editor on screen
import type { EditSession } from '$lib/collab/editSession';

const ids = new WeakMap<object, number>();
let next = 1;

function idOf(text: object | null | undefined): number {
	if (!text) return 0;
	let id = ids.get(text);
	if (id === undefined) ids.set(text, (id = next++));
	return id;
}

export function sourceEditorKey(session: EditSession, path: string | null): string {
	// read so the key is worked out again when the shared files change; only this file's binding counts
	void session.manifestRev;
	return `${path}:${session.active}:${idOf(session.collabFor(path)?.ytext)}`;
}
