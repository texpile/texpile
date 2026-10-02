// what CompilePipeline needs from the workspace view that wires it
import type { EditSession } from '$lib/collab/editSession';
import type { DockView } from '$lib/terminal/dockView';

export type CompileDeps = {
	getLoadedPath(): string | null;
	/** the reactive compile command; {main} expands to the main file's path. */
	getCompileCommand(): string;
	terminalAvailable(): boolean;
	/** first-compile main-file confirmation state (null = unresolved for the current folder). */
	mainConfirmed(): boolean | null;
	/** the project names a compile command this machine has not accepted yet; nothing runs until
	 * the bar is answered. See projectConfig.ts for why the command alone needs consent. */
	commandPending(): boolean;
	getSession(): EditSession;
	getDock(): { runCommand(cmd: string, onDone?: (output: string) => void): void; interrupt(): void } | undefined;
	stat(path: string): Promise<{ exists: boolean; mtimeMs: number; size: number }>;
	readText(path: string): Promise<string>;
	create(path: string, type: 'file' | 'dir'): Promise<unknown>;
	fileUrl(path: string): string;
	/** flush the queued autosave and wait for it to land (SyncTeX needs the on-disk copy current). */
	flushSaves(): Promise<void>;
	refreshTree(): Promise<void>;
	showTerminal(): void;
	setDockView(view: DockView): void;
	setPdfPaneOpen(open: boolean): void;
	openCompileModal(): void;
	openMainConfirm(then?: () => void): void;
	/** is this path still there? the chosen main file can be renamed or deleted from outside */
	fileExists(path: string): Promise<boolean>;
	/** forget a main file that is no longer on disk, so the picker opens instead of a dead target */
	clearMainFile(): void;
	runDraftCompile(): Promise<void>;
	/** open the Typst live preview pane (its own attach effect does the rest). */
	openTypstPreview(): void;
	/** publish the parsed compile products (aux numbers + diagnostics) to session guests. */
	shareCompileState(): void;
};
