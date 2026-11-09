// a file the document reads changed without being the open one: an agent's write, a pull, an edit in another editor
// group. Live mode followed only the open file, so the preview kept the old text until the next keystroke there
import { fileService } from '$lib/files/service/fileService';
import { isSameFile, pathBelow } from '$lib/files/identity/fileUris';
import { textNow } from '$lib/buffers/textNow';

const TEXT = /\.tex$/i;
// read whole by a compile: a teleport only carries a .tex file's text
const REBUILD = /\.(sty|cls|bib|bbl|png|jpe?g)$/i;

export type DraftInputDeps = {
	root(): string;
	loadedPath(): string | null;
	isActive(): boolean;
	edit(path: string, text: string): void;
	rebuild(): void;
};

export function watchDraftInputs(deps: DraftInputDeps): () => void {
	function changed(paths: string[], read: (path: string) => Promise<string>): void {
		if (!deps.isActive()) return;
		const root = deps.root();
		const open = deps.loadedPath();
		for (const path of paths) {
			const rel = root ? pathBelow(root, path) : null;
			if (!rel || rel.startsWith('_draft/') || (open && isSameFile(path, open))) continue;
			if (TEXT.test(path)) void read(path).then((text) => deps.edit(path, text));
			else if (REBUILD.test(path)) deps.rebuild();
		}
	}
	const offChanges = fileService.onDidFilesChange((e) =>
		changed(
			[...e.rawUpdated, ...e.rawAdded].map((uri) => uri.fsPath),
			(path) => fileService.readText(path)
		)
	);
	// the app's own writes: an MCP edit, or a file saved from another editor group
	const offWrites = fileService.onDidRunOperation((e) => {
		if (e.isOperation('write')) changed([e.resource.fsPath], (path) => textNow(path));
	});
	return () => {
		offChanges();
		offWrites();
	};
}
