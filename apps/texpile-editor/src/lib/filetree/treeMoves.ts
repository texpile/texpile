// where files were just moved (a rename, a drag, an agent's move): the open file's row remounts under its new path,
// which is not the open file changing, so the tree keeps its scroll instead of following the row
import type { URI } from 'vscode-uri';
import { fileService } from '$lib/files/service/fileService';
import { extUri } from '$lib/files/identity/extUri';
import { fileUriOf } from '$lib/files/identity/fileUris';

const RECENT_MS = 2000;
const moves: { to: URI; at: number }[] = [];

export function watchTreeMoves(): () => void {
	return fileService.onDidRunOperation((e) => {
		if (e.isOperation('move') && e.target) moves.push({ to: e.target, at: performance.now() });
	});
}

export function justMoved(path: string): boolean {
	const now = performance.now();
	while (moves.length && now - moves[0].at > RECENT_MS) moves.shift();
	const uri = fileUriOf(path);
	return moves.some((m) => extUri.isEqualOrParent(uri, m.to));
}
