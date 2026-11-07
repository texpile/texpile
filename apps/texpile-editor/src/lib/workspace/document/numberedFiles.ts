// the folder's files as the visual editor's numbers read them in, each one's numbered nodes read off its text once
import { FileIndex } from '$lib/files/index/fileIndex';
import { chipCounts } from '$lib/languages/latex/visual/core/plugin/chipCounts';
import { eventsIn, type EventScheme, type NumberEvent } from '$lib/languages/latex/visual/extensions/numbers/numberEvents';
import type { NumberedFiles, ReadInFile } from '$lib/languages/latex/visual/extensions/numbers/readInEvents';
import { dirname, pathKey } from '../fileSystem';
import { parseLatexFile } from '../latexRoundtrip';
import { includePaths } from './texIncludes';
import type { DocumentFiles } from '$lib/stores/projectIntel';

const fileEvents = new FileIndex<NumberEvent[] | null, EventScheme>(
	(_path, text, scheme) => {
		try {
			return eventsIn(parseLatexFile(text).doc, chipCounts, scheme);
		} catch {
			return null;
		}
	},
	({ mathOpeners, theorems }) => `${mathOpeners.macros.join(' ')}|${mathOpeners.environments.join(' ')}|${JSON.stringify(theorems)}`
);

export function numberedFilesOf(files: DocumentFiles, scheme: EventScheme): NumberedFiles {
	function fileAt(path: string): ReadInFile | null {
		const found = files.texts[pathKey(path)];
		const events = found ? fileEvents.get(found.path, found.text, scheme) : null;
		return found && events ? { path: found.path, events } : null;
	}
	return {
		start: () => (files.start ? fileAt(files.start) : null),
		readIn(include, from) {
			for (const path of includePaths(include, dirname(from), [dirname(from), files.root])) {
				const file = fileAt(path);
				if (file) return file;
			}
			return null;
		}
	};
}
