// One export from options to files on disk: ask where, save what is typed, run tinymist, and say
// what it wrote or why it did not. The platform dialog, the save and the server come in as deps,
// so the sequence can be followed without Electron or a language server.
import { dirname, joinPath } from '$lib/workspace/fileSystem';
import { exportDestination } from './exportOptions';
import { exportCommandFor, exportStem, outputPathFor, type TypstExportJob } from './exportCommand';
import { exportErrorText, writtenPaths } from './exportResult';
import type { ExportTargetRequest } from './exportTarget';
import type { TypstExportOptions } from './exportOptions.types';
import { m } from '$lib/paraglide/messages';

export type ExportRunDeps = {
	root: string;
	/** the main file, absolute: tinymist exports the document it is the entry of */
	main: string;
	/** where the last export for this folder went; the dialog opens there */
	lastDir: string | null;
	pick: (req: ExportTargetRequest) => Promise<string | null>;
	/** is there a tinymist to run at all */
	serverReady: () => Promise<boolean>;
	/** edits still waiting to be saved reach the disk first, where tinymist reads every file it has not been sent */
	flushSaves: () => Promise<unknown>;
	run: (job: TypstExportJob) => Promise<unknown>;
};

export type ExportOutcome =
	| { kind: 'cancelled' }
	| { kind: 'failed'; message: string; missingTool?: boolean }
	/** `dir` is where the files landed, remembered as the next export's starting point */
	| { kind: 'done'; paths: string[]; dir: string };

export async function runTypstExport(options: TypstExportOptions, deps: ExportRunDeps): Promise<ExportOutcome> {
	if (!(await deps.serverReady())) return { kind: 'failed', message: m.compile_tool_missing({ tool: 'tinymist' }), missingTool: true };
	const kind = exportDestination(options);
	const startDir = deps.lastDir ?? deps.root;
	const destination = await deps.pick(
		kind === 'file'
			? {
					kind,
					defaultPath: joinPath(startDir, `${exportStem(deps.main)}.${options.format}`),
					extension: options.format,
					title: m.typst_export_pick_file({ format: options.format.toUpperCase() })
				}
			: { kind, defaultPath: startDir, title: m.typst_export_pick_folder() }
	);
	if (!destination) return { kind: 'cancelled' };
	const output = outputPathFor(options, destination, deps.main);
	if (!output.ok) return { kind: 'failed', message: m.typst_export_bad_path({ token: output.token }) };
	await deps.flushSaves();
	let response: unknown;
	try {
		response = await deps.run({ ...exportCommandFor(options, deps.main), outputPath: output.outputPath });
	} catch (err) {
		// the raw error for whoever needs it; the dialog shows it reworded
		console.error('typst export failed:', err);
		return { kind: 'failed', message: exportErrorText(err) };
	}
	const paths = writtenPaths(response);
	if (!paths.length) return { kind: 'failed', message: m.typst_export_nothing_written() };
	return { kind: 'done', paths, dir: kind === 'folder' ? destination : dirname(paths[0]) };
}
