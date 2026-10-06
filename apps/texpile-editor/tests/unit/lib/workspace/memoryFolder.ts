// an open folder on an in-memory disk: its text buffers and the writer the workspace puts over them
import { TextBuffers, type TextBuffersFs, type WriteHooks } from '$lib/buffers/textBuffers';
import { FileWriter } from '$lib/workspace/fileWriter';

/** absolute path -> file content */
export type MemoryDisk = Record<string, string>;

export function memoryFs(disk: MemoryDisk): TextBuffersFs {
	return {
		readBytes: async (p) => {
			if (!(p in disk)) throw new Error(`ENOENT: ${p}`);
			return new TextEncoder().encode(disk[p]);
		},
		writeText: async (p, content) => void (disk[p] = content),
		listFiles: async (root) =>
			Object.keys(disk)
				.filter((p) => p.startsWith(root + '/'))
				.map((p) => ({ rel: p.slice(root.length + 1), size: disk[p].length }))
	};
}

/** the save guard as a content stamp: a file changed outside when it no longer reads as last stamped */
export function memoryStamps(disk: MemoryDisk): { stamp: MemoryDisk; hooks: Pick<WriteHooks, 'diskChanged' | 'recordStamp'> } {
	const stamp: MemoryDisk = {};
	return {
		stamp,
		hooks: {
			diskChanged: async (p) => disk[p] !== stamp[p],
			recordStamp: async (p) => void (stamp[p] = disk[p])
		}
	};
}

export async function openMemoryFolder(
	root: string,
	fs: TextBuffersFs,
	opts: { open?: string[]; loaded?: () => string | null; hooks?: WriteHooks } = {}
) {
	const buffers = new TextBuffers(root, fs, (r, rel) => `${r}/${rel}`);
	buffers.hooks = opts.hooks ?? {};
	const relOf = (p: string) => (p.startsWith(root + '/') ? p.slice(root.length + 1) : null);
	const writer = new FileWriter({ getLoadedPath: opts.loaded ?? (() => null), isGuest: () => false, files: () => buffers, relOf });
	for (const p of opts.open ?? []) await buffers.ensure(relOf(p)!);
	return {
		buffers,
		writer,
		relOf,
		/** the file's text, as every editor on it shows it */
		textOf: (p: string) => buffers.text(relOf(p)!)?.toString() ?? null,
		/** an editor's edit, carried into the text as session().edit does */
		type: (p: string, content: string) => buffers.fold(relOf(p)!, content),
		/** what FileOpener.open does: wait for the writer, then the text catches up with its disk */
		load: async (p: string) => {
			await writer.whenIdle();
			await buffers.ensure(relOf(p)!);
		}
	};
}
