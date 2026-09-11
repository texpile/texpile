// what WorkspaceView hands WorkspaceMain; a types file so the wiring component stays legible
import type { DraftController } from '$lib/draft/draftController.svelte';
import type { DocumentBuffer, FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import type { PaneLayout } from '$lib/workspace/paneLayout.svelte';
import type { DiffMode } from '$lib/workspace/diffMode.svelte';
import type { VisualParser } from '$lib/workspace/visualParse.svelte';
import type { TerminalDockState } from '$lib/workspace/terminalDockState.svelte';
import type { CommentsController } from '$lib/workspace/commentsController.svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the pipelines are structural here
type Any = any;

export type WorkspaceMainProps = {
	doc: DocumentBuffer;
	modes: ViewModeSwitch;
	layout: PaneLayout;
	diff: DiffMode;
	parser: VisualParser;
	termDock: TerminalDockState;
	commentsCtl: CommentsController;
	compiler: Any;
	saver: Any;
	session: Any;
	guest: boolean;
	kind: FileKind;
	nameOnly: boolean;
	folderEmpty: boolean;
	modLabel: string;
	dockShrunk: boolean;
	/** live-preview inputs: root, main file, recompile trigger, paused flag */
	draft: DraftController;
	/** `host:port` of a running Typst preview, null while one is still starting */
	typstPreviewHost: string | null;
	/** this pane is for a Typst preview, even before it has an address */
	typstPreviewWanted: boolean;
	/** the main file is .typ, so Typst owns the output even when its preview is unavailable */
	mainIsTypst: boolean;
	/** guest: the host streams its live Typst preview, shown instead of the pushed PDF */
	guestTypstOffered: boolean;
	/** no main file in a folder that has candidates: the pane shows the pick-a-main message */
	mainUnset: boolean;
	/** open the set-main-file prompt (the pane's message carries the button) */
	onPickMain: () => void;
	/** editor inputs that are not workspace state: tabs, references, jump targets */
	panes: Any;
	actions: Any;
	dockView: 'terminal' | 'problems' | 'comments';
	pdfPaneRef: Any;
};
