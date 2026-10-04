// an editor caught up with the shared text edits the words it shows, even ones a collaborator deleted and typed again
import { it, expect } from 'vitest';
import * as Y from 'yjs';
import { LocalFork } from '$lib/collab/localFork';

function sharedWithFork(text: string, remoteClient?: number) {
	const shared = new Y.Doc();
	shared.getText('f').insert(0, text);
	const fork = new LocalFork(shared);
	const remote = new Y.Doc();
	if (remoteClient !== undefined) remote.clientID = remoteClient;
	Y.applyUpdate(remote, Y.encodeStateAsUpdate(shared));
	remote.on('update', (u: Uint8Array, origin: unknown) => {
		if (origin !== shared) Y.applyUpdate(shared, u, remote);
	});
	shared.on('update', (u: Uint8Array, origin: unknown) => {
		if (origin !== remote) Y.applyUpdate(remote, u, shared);
	});
	// this side typed once, so the fork's copy stands at this state
	fork.fold(shared.getText('f'), text + '!', text, 'edit');
	return { shared, fork, remote };
}

it('deletes the words a collaborator deleted and took back with undo', () => {
	const { shared, fork, remote } = sharedWithFork('the foo bar');
	const theirs = remote.getText('f');
	const undo = new Y.UndoManager(theirs, { captureTimeout: 0 });
	theirs.delete(4, 4);
	undo.undo();
	expect(shared.getText('f').toString()).toBe('the foo bar!');
	fork.fold(shared.getText('f'), 'the bar!', 'the foo bar!', 'edit');
	expect(shared.getText('f').toString()).toBe('the bar!');
	expect(theirs.toString()).toBe('the bar!');
	fork.destroy();
});

it('types after a word a collaborator deleted and typed again, not before it', () => {
	// either side of the fork's own client id, which decides where an edit beside dead words lands
	for (const client of [1, 0xfffffffe]) {
		const { shared, fork, remote } = sharedWithFork('the foo bar', client);
		const theirs = remote.getText('f');
		theirs.delete(4, 3);
		theirs.insert(4, 'foo');
		expect(shared.getText('f').toString()).toBe('the foo bar!');
		fork.fold(shared.getText('f'), 'the food bar!', 'the foo bar!', 'edit');
		expect(shared.getText('f').toString(), `remote client ${client}`).toBe('the food bar!');
		fork.destroy();
	}
});
