// The renderer half of the tinymist language server: a Transport over the preload bridge, and one
// LSPClient per workspace root.
//
// Everything above this file talks to @codemirror/lsp-client, never to tinymist directly. That is
// deliberate: the intellisense is an integration against the PROTOCOL, so a different Typst server
// would be a change here and nowhere else. (Live preview, if it is ever added, is not like this -
// tinymist's preview is its own private protocol, and would be genuine lock-in.)
import { LSPClient, LSPPlugin } from '@codemirror/lsp-client';
import { typstServerExtensions } from './serverExtensions';
import { sanitizeDocHtml } from './lspDocHtml';
import type { Transport } from '@codemirror/lsp-client';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { box } from '$lib/runes/box.svelte';
import { observe } from '$lib/runes/observe.svelte';
import { settings } from '$lib/settings';
import { mainFile } from '$lib/workspace/workspaceStore';
import { applyTextEdits, type LspTextEdit } from './textEdits';
import { normalizeCompletionJson } from './completion/completionNormalize';
import { TypstWorkspace } from './typstWorkspace';

// @codemirror/lsp-client caps its SIGNATURE tooltips but not its hover tooltips, and tinymist's
// hover for a builtin is the function's whole documentation page - unconstrained, that renders
// as a window-wide wall of text. Same box the signature tooltip gets, a little roomier.
export const lspHoverTheme = EditorView.baseTheme({
	'.cm-lsp-hover-tooltip': {
		maxWidth: '38em',
		maxHeight: '16em',
		overflow: 'auto',
		borderRadius: '6px',
		padding: '4px 10px',
		fontSize: '90%',
		lineHeight: '1.45'
	},
	'.cm-lsp-hover-tooltip pre': {
		overflowX: 'auto'
	}
});

/**
 * An absolute filesystem path as a file:// URI.
 *
 * Windows needs the extra slash and a forward-slashed drive path (`file:///C:/a/b`); every path
 * segment is encoded so a folder with a space or a `#` in it doesn't produce a URI the server
 * reads as something else.
 */
export function fileUri(p: string): string {
	const norm = p.replace(/\\/g, '/');
	const withRoot = /^[A-Za-z]:/.test(norm) ? `/${norm}` : norm;
	return (
		'file://' +
		withRoot
			.split('/')
			.map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
			.join('/')
	);
}

function bridge() {
	return typeof window !== 'undefined' ? window.texpileTypst : undefined;
}

/** True when the tinymist bridge exists at all (it does not in the browser dev server). */
export function typstBridgeAvailable() {
	return !!bridge();
}

/** does a tinymist binary actually resolve on this machine? A failed preview start branches on
 *  this: "install tinymist" is actionable, "no preview address" is not. */
export async function tinymistResolved(): Promise<boolean> {
	try {
		return !!(await bridge()?.resolve());
	} catch {
		return false;
	}
}

function createTransport(): Transport {
	const handlers = new Set<(value: string) => void>();
	const b = bridge();
	// one subscription to the bridge, fanned out here: the client may subscribe and unsubscribe
	// repeatedly over its life, and re-registering an IPC listener each time would leak them
	b?.onMessage((raw) => {
		if (handleShowDocument(raw, b)) return;
		observeDiagnostics(raw);
		// field-less "snippets" become plain text here, or accepting one strands the caret
		const json = normalizeCompletionJson(raw);
		for (const h of handlers) h(json);
	});
	return {
		send(message: string) {
			bridge()?.send(withInitializationOptions(message));
		},
		subscribe(handler: (value: string) => void) {
			handlers.add(handler);
		},
		unsubscribe(handler: (value: string) => void) {
			handlers.delete(handler);
		}
	};
}

/**
 * The settings, on the `initialize` request itself.
 *
 * tinymist reads some settings only when it builds the project, and a later didChangeConfiguration
 * does not rebuild it for them - the lint switch is one, so pushed after the handshake it never took
 * effect. @codemirror/lsp-client has no initializationOptions of its own, so they are added here, on
 * the way out.
 */
function withInitializationOptions(message: string): string {
	if (!message.includes('"initialize"')) return message;
	const msg = JSON.parse(message) as { method?: string; params?: Record<string, unknown> };
	if (msg.method !== 'initialize') return message;
	return JSON.stringify({ ...msg, params: { ...msg.params, initializationOptions: serverSettings } });
}

type Session = {
	root: string | null;
	client: LSPClient;
	/** resolves once the server process is up; the client's own `initializing` follows it */
	started: Promise<boolean>;
};

let session: Session | null = null;

/** the host's open .typ as its editor last had it, whether or not a server is running to take it */
let streamed: { root: string | null; uri: string; text: string } | null = null;

function workspaceOf(client: LSPClient): TypstWorkspace | null {
	return client.workspace instanceof TypstWorkspace ? client.workspace : null;
}

/** the running server's workspace, only if it serves `root`; never starts one */
function runningWorkspace(root: string | null): TypstWorkspace | null {
	return session && session.root === root ? workspaceOf(session.client) : null;
}

/**
 * Bumped when the server process DIES out from under us (never for our own stops - the spawn
 * suppresses those, see typstService). By the bump the dead client is already dropped, so
 * subscribers re-arm against a fresh `typstClient()`: WorkspaceView restarts a live preview whose
 * task died with the server, and each open .typ editor rebuilds its LSP extension - both were
 * otherwise left holding a corpse, the pane dialing a dead port forever.
 */
export const typstServerGen = box(0);

let exitHooked = false;
function dropSession(): void {
	cancelIdleStop();
	holders = 0;
	const dead = session;
	session = null;
	try {
		dead?.client.disconnect();
	} catch {
		/* transport already gone */
	}
}

function hookExit(): void {
	if (exitHooked) return;
	const b = bridge();
	if (!b?.onExit) return;
	exitHooked = true;
	b.onExit(() => {
		dropSession();
		typstServerGen.current += 1;
	});
	// a server running the copy that changed hears about it as an exit (main stops it); one that
	// never started for want of tinymist only hears this, and tries again
	b.onTinymistFinished?.((result) => {
		if (result.ok) retryUnstartedSession();
	});
}

function retryUnstartedSession(): void {
	const tried = session;
	void tried?.started.then((up) => {
		if (up || session !== tried) return;
		dropSession();
		typstServerGen.current += 1;
	});
}

// the folders in Preferences moved PATH: the running server is the old pick, the next start is the new one.
// at module level on purpose: created inside an editor effect it went away with that effect
let seenDirs = settings.current.toolDirs;
observe(
	() => settings.current.toolDirs,
	(dirs) => {
		if (dirs === seenDirs) return;
		seenDirs = dirs;
		if (!session) return;
		dropSession();
		bridge()?.stopLsp();
		typstServerGen.current += 1;
	}
);

/**
 * Texpile's tinymist settings, sent WHOLE on every push.
 *
 * tinymist does not merge a didChangeConfiguration into what it has: every key a push leaves out
 * goes back to its default (config.rs, `update_by_map`). A push of the export path alone turned the
 * formatter off, and one of the formatter alone forgot the export path - so every push goes through
 * pushSettings, with all of them.
 */
const serverSettings: {
	/** tinymist ships with the formatter disabled; typstyle is the one its VS Code extension binds */
	formatterMode: 'typstyle';
	/**
	 * tinymist's own checks beyond the compiler's: a font family that does not exist (with the
	 * nearest names), a `#set`/`#show` rule that cannot take effect where it stands, a value a
	 * function silently throws away. Off unless asked for, and read only at startup (see
	 * withInitializationOptions). `onType` because nothing here ever sends didSave - on its
	 * `onSave` default the checks would never run at all.
	 */
	lint: { enabled: boolean; when: 'onType' };
	/** where an export writes; set per export (see typstClientForExport) */
	outputPath?: string;
} = { formatterMode: 'typstyle', lint: { enabled: true, when: 'onType' } };

function pushSettings(client: LSPClient): void {
	client.notification('workspace/didChangeConfiguration', { settings: serverSettings });
}

/**
 * Make the folder's main file tinymist's entry, whichever file is open.
 *
 * Unpinned, tinymist compiles whatever document was touched last, so a chapter open on its own is
 * checked as a document of its own: every `@label` and `@citation` defined elsewhere is an error,
 * the main's `#set` rules do not apply, and completion offers none of the main's labels. Pinned, the
 * chapter is checked as part of the document it belongs to. A main that is not a .typ (a LaTeX
 * project with a scratch .typ) pins nothing, which hands tinymist back its own choice.
 */
function pinMain(client: LSPClient, main: string | null): void {
	const entry = main && /\.typ$/i.test(main) ? main : null;
	client
		.request<{ command: string; arguments: unknown[] }, unknown>('workspace/executeCommand', {
			command: 'tinymist.pinMain',
			arguments: [entry]
		})
		.catch(() => {
			/* an old tinymist without the command: it keeps choosing its own entry, as before */
		});
}

// the main file changed (the user picked another, or a different folder opened): re-pin the running
// server. Module level for the same reason as the tool-folder watch above.
observe(
	() => mainFile.current,
	(main) => {
		const s = session;
		if (!s) return;
		void s.started.then((ok) => {
			if (ok && session === s) void s.client.initializing.then(() => pinMain(s.client, main));
		});
	}
);

/**
 * How many open editors are using the server.
 *
 * It costs ~90MB resident with one document open, which is worth reclaiming when the last .typ is
 * closed - a LaTeX project that once opened a .typ should not hold a Typst compiler all afternoon.
 * It is never started for a project without a .typ in the first place: only typstLspExtension
 * starts it, and only a .typ editor calls that.
 */
let holders = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// Shutting down the instant the count hits zero would thrash: switching between two .typ files
// destroys one editor before creating the next, and a restart costs ~1.5s plus re-initialising the
// project. Wait long enough that a file switch never pays it.
const IDLE_GRACE_MS = 30_000;

export function cancelIdleStop(): void {
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
}

/**
 * The client for `root`, starting the server if needed. Returns null when tinymist is missing or
 * the bridge isn't there — callers then simply add no LSP extension, and the editor still works.
 */
export async function typstClient(root: string | null): Promise<LSPClient | null> {
	const b = bridge();
	if (!b) return null;
	hookExit();
	if (session && session.root === root) return (await session.started) ? session.client : null;

	endSession();

	const client = new LSPClient({
		rootUri: root ? fileUri(root) : undefined,
		extensions: typstServerExtensions(),
		sanitizeHTML: sanitizeDocHtml,
		workspace: (c) => new TypstWorkspace(c),
		notificationHandlers: {
			// tinymist's click-to-jump: the framed preview reports the span the user clicked over its
			// own websocket, the server resolves it to a file and range, and it lands here. Same
			// channel tinymist's VS Code extension listens on.
			'tinymist/preview/scrollSource': (_client, params: PreviewJumpInfo) => {
				jumpHandler?.(params);
				return true;
			}
		},
		// tinymist can take a moment on a cold project (it reads fonts and the package cache);
		// the 3s default times out completions that would have arrived
		timeout: 10000
	});
	// a fresh server (first start, restart, folder switch) opens the visual editor's document too;
	// the workspace announces it once the client connects
	if (streamed && streamed.root === root) workspaceOf(client)?.openText(streamed.uri, 'typst', streamed.text);

	const started = b.startLsp(root).then((res) => {
		if (!res.ok) return false;
		client.connect(createTransport());
		// the entry, as soon as the handshake allows anything to be sent (the settings went with it)
		client.initializing.then(
			() => pinMain(client, mainFile.current),
			() => {
				/* the server died during initialize; the exit hook handles that */
			}
		);
		return true;
	});

	session = { root, client, started };
	return (await started) ? client : null;
}

/**
 * Hand the server the host's open .typ as the editor has it, or pass a null `path` to let go.
 *
 * The source editor's plugin streams its own edits; the visual editor has no plugin, so without
 * this the server compiled the file on DISK - the preview trailed typing by an autosave plus the
 * watcher's lag. An edit is recorded, not sent: syncTypstDocuments() sends, so the caller can
 * debounce typing, and any request that syncs first (a preview scroll, a guest's completion) sees
 * the newest text regardless. True when an edit is waiting on that sync; opening and closing go
 * out at once. Never starts the server: a document is no reason to spend its ~90MB, and whichever
 * server starts next opens it.
 */
export function streamTypstDocument(root: string | null, path: string | null, text: string): boolean {
	const previous = streamed;
	const uri = path ? fileUri(path) : null;
	streamed = uri ? { root, uri, text } : null;
	const same = !!previous && previous.uri === uri && previous.root === root;
	if (previous && !same) runningWorkspace(previous.root)?.closeText(previous.uri);
	if (!uri) return false;
	const workspace = runningWorkspace(root);
	if (same) return workspace?.updateText(uri, text) ?? false;
	workspace?.openText(uri, 'typst', text);
	return false;
}

/** send the running server whatever its open documents have gained since the last sync */
export function syncTypstDocuments(): void {
	session?.client.sync();
}

/** what `tinymist.doStartPreview` answers with */
export async function formatTypstDocument(root: string | null, file: string, text: string): Promise<string> {
	const client = await typstClient(root);
	// worded as main words a missing program, so Format offers the install rather than an error
	if (!client) throw new Error((await tinymistResolved()) ? 'tinymist is not available' : 'tinymist was not found on PATH.');
	pushSettings(client);
	const edits = await client.request<
		{ textDocument: { uri: string }; options: { tabSize: number; insertSpaces: boolean } },
		LspTextEdit[] | null
	>('textDocument/formatting', { textDocument: { uri: fileUri(file) }, options: { tabSize: 2, insertSpaces: true } });
	// null/empty means "already formatted", which is a success, not a failure
	if (!Array.isArray(edits) || edits.length === 0) return text;
	return applyTextEdits(text, edits);
}

/** one file's share of a rename, keyed by absolute path rather than URI */
export type RenameFileEdits = {
	path: string;
	edits: LspTextEdit[];
};

/**
 * Ask tinymist to rename the symbol at `offset` in `file`, and return the edits it wants made,
 * grouped per file.
 *
 * The reply covers the WHOLE project, not just the open document - that is the point of a rename,
 * and it is what the built-in CodeMirror command silently drops (its default Workspace only
 * applies edits to files that already have an editor view, and Texpile shows one file at a time).
 * Nothing is applied here; the caller owns writing, because the open file and the rest of the
 * project are written by different routes.
 *
 * `documentChanges` (the versioned form) is accepted as well as `changes`: which one a server
 * sends depends on the client capabilities it was initialised with, and tinymist can send either.
 */
export type LspWorkspaceEdit = {
	changes?: Record<string, LspTextEdit[]>;
	documentChanges?: { textDocument?: { uri?: string }; edits?: LspTextEdit[] }[];
};

/** Flatten a WorkspaceEdit into per-file edit lists. Kept separate from the request so the shape
 *  handling is testable without a server. */
export function renameEditsFrom(res: LspWorkspaceEdit | null): RenameFileEdits[] {
	if (!res) return [];
	const out: RenameFileEdits[] = [];
	for (const [uri, edits] of Object.entries(res.changes ?? {})) {
		if (edits?.length) out.push({ path: pathFromUri(uri), edits });
	}
	for (const change of res.documentChanges ?? []) {
		const uri = change.textDocument?.uri;
		if (!uri || !change.edits?.length) continue;
		const path = pathFromUri(uri);
		// a server that sent both forms must not have the file written twice
		if (!out.some((o) => o.path === path)) out.push({ path, edits: change.edits });
	}
	return out;
}

export async function renameTypstSymbol(
	root: string | null,
	file: string,
	position: { line: number; character: number },
	newName: string
): Promise<RenameFileEdits[]> {
	const client = await typstClient(root);
	if (!client) throw new Error('tinymist is not available');
	const res = await client.request<
		{ textDocument: { uri: string }; position: { line: number; character: number }; newName: string },
		LspWorkspaceEdit | null
	>('textDocument/rename', { textDocument: { uri: fileUri(file) }, position, newName });
	return renameEditsFrom(res);
}

/**
 * The client, with tinymist told to write the next export to `outputPath` and sent the newest text,
 * for an export (languages/typst/export), whose own request follows. Where to write travels as
 * configuration: it is the server-level `outputPath` pattern, and the export commands have no
 * per-call override. Null without a server.
 */
export async function typstClientForExport(root: string | null, outputPath: string): Promise<LSPClient | null> {
	const client = await typstClient(root);
	if (!client) return null;
	serverSettings.outputPath = outputPath;
	pushSettings(client);
	client.sync(); // the last keystrokes may still be waiting on a sync debounce
	return client;
}

/**
 * Subscribe to "the user clicked somewhere in the preview; put the caret there".
 *
 * The framed page cannot reach us directly and does not need to: it sends the span it was clicked
 * on over the data plane, tinymist resolves it, and the answer arrives here as a plain LSP
 * notification. This is exactly how tinymist's own VS Code extension implements click-to-jump.
 *
 * Positions are ZERO-based `[line, character]`, and either end may be null when the span could not
 * be resolved to a range.
 */
export type PreviewJumpInfo = {
	filepath: string;
	start: [number, number] | null;
	end: [number, number] | null;
};

/**
 * Where a preview jump goes. Held at module scope rather than passed to typstClient because the
 * handler is fixed at CONSTRUCTION - LSPClient takes notificationHandlers as config, and the pane
 * that wants the jumps mounts long after the client exists.
 */
let jumpHandler: ((jump: PreviewJumpInfo) => void) | null = null;

/** Route preview clicks to `handler`, or pass null to stop. */
export function setPreviewJumpHandler(handler: ((jump: PreviewJumpInfo) => void) | null): void {
	jumpHandler = handler;
}

/** file:// URI back to a plain path, undoing fileUri() */
export function pathFromUri(uri: string): string {
	try {
		const p = decodeURIComponent(new URL(uri).pathname);
		return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
	} catch {
		return uri;
	}
}

/**
 * Answer the server's `window/showDocument` request, which is how a click in the preview reaches us.
 *
 * Intercepted at the TRANSPORT rather than through the client's notificationHandlers, because this
 * is a REQUEST and not a notification - the server waits for a reply, and an unanswered one would
 * leave it hanging. The client has no hook for server-initiated requests, but the transport is ours.
 *
 * tinymist has a `customizedShowDocument` mode that sends a bespoke notification instead. We
 * deliberately do not turn it on: showDocument is the standard LSP method, so this keeps working if
 * that option ever goes away.
 *
 * Returns true when the message was ours to answer and should not be forwarded on.
 */
function handleShowDocument(json: string, b: NonNullable<ReturnType<typeof bridge>>): boolean {
	let msg: {
		id?: number | string;
		method?: string;
		params?: { uri?: string; selection?: { start?: { line?: number; character?: number } } };
	};
	try {
		msg = JSON.parse(json);
	} catch {
		return false;
	}
	if (msg.method !== 'window/showDocument' || msg.id === undefined) return false;

	const uri = msg.params?.uri;
	if (uri && jumpHandler) {
		const start = msg.params?.selection?.start;
		jumpHandler({
			filepath: pathFromUri(uri),
			start: start ? [start.line ?? 0, start.character ?? 0] : null,
			end: null
		});
	}
	// the server blocks on this reply
	b.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { success: !!(uri && jumpHandler) } }));
	return true;
}

/** One LSP diagnostic, as tinymist publishes it; just what the Problems panel needs. */
export type TypstDiagnostic = {
	range: { start: { line: number; character: number }; end?: { line: number; character: number } };
	/** 1 error, 2 warning, 3 info, 4 hint */
	severity?: number;
	message: string;
};

let diagnosticsHandler: ((path: string, diags: TypstDiagnostic[]) => void) | null = null;

/**
 * Subscribe to tinymist's live diagnostics, delivered per FILE - an empty list clears that file,
 * which is LSP's own clearing convention and must be forwarded, not filtered.
 *
 * OBSERVED at the transport, never consumed: the same notification drives the editor's squiggles
 * through the LSP client, and taking it out of the stream would kill those. The Problems panel
 * needs its own tap because in Preview mode no shell compile ever runs, so the log watcher that
 * normally fills the panel has nothing to parse.
 */
export function setTypstDiagnosticsHandler(h: ((path: string, diags: TypstDiagnostic[]) => void) | null): void {
	diagnosticsHandler = h;
}

/**
 * The same stream, for listeners that must run whatever the editor is doing.
 *
 * Separate from the handler above because that one is a single slot owned by the Problems panel
 * and only armed in Preview mode. A collaboration host has to forward diagnostics to its guests
 * regardless of which mode it happens to be in - a guest's squiggles cannot depend on whether
 * somebody else has a preview pane open.
 */
const diagnosticsListeners = new Set<(path: string, diags: TypstDiagnostic[]) => void>();

export function addTypstDiagnosticsListener(fn: (path: string, diags: TypstDiagnostic[]) => void): () => void {
	diagnosticsListeners.add(fn);
	return () => diagnosticsListeners.delete(fn);
}

function observeDiagnostics(json: string): void {
	// cheap substring gate first: this runs on EVERY server message, most of which are not this
	if ((!diagnosticsHandler && diagnosticsListeners.size === 0) || !json.includes('"textDocument/publishDiagnostics"')) return;
	let msg: { method?: string; params?: { uri?: string; diagnostics?: TypstDiagnostic[] } };
	try {
		msg = JSON.parse(json);
	} catch {
		return;
	}
	if (msg.method !== 'textDocument/publishDiagnostics' || !msg.params?.uri) return;
	const path = pathFromUri(msg.params.uri);
	const diags = msg.params.diagnostics ?? [];
	diagnosticsHandler?.(path, diags);
	for (const fn of diagnosticsListeners) fn(path, diags);
}

/** Tear the server down (no editors left, or the window going away). */
export function stopTypstClient(): void {
	holders = 0;
	endSession();
}

/** the server goes and the references stay: a folder switch's were taken for the server that starts next */
function endSession(): void {
	cancelIdleStop();
	if (!session) return;
	try {
		session.client.disconnect();
	} catch {
		/* never connected, or already gone */
	}
	bridge()?.stopLsp();
	session = null;
}

/**
 * One open .typ editor has gone away.
 *
 * The server stops once nothing is using it, after a grace period — see IDLE_GRACE_MS.
 */
/**
 * Take a reference without opening an editor, for a user that is not one.
 *
 * A collaboration guest's requests are served by this server, but the guest has no editor HERE to
 * hold it open. Without this the host closing its last .typ tab starts the idle timer and reclaims
 * the server out from under every guest in the session - intellisense that works, then stops
 * thirty seconds later for no reason the guest can see.
 */
export function acquireTypstLsp(): void {
	holders++;
	cancelIdleStop();
}

export function releaseTypstLsp(): void {
	holders = Math.max(0, holders - 1);
	if (holders > 0) return;
	cancelIdleStop();
	idleTimer = setTimeout(() => {
		idleTimer = null;
		// a new editor may have taken a reference while the timer ran
		if (holders === 0) stopTypstClient();
	}, IDLE_GRACE_MS);
}

/**
 * The CodeMirror extension that wires one open .typ file to the server, or null when there is no
 * server to wire it to. `languageID` is tinymist's own id for the dialect.
 */
export async function typstLspExtension(root: string | null, filePath: string): Promise<Extension | null> {
	// take the reference BEFORE awaiting: a pending idle-stop from the editor we are replacing must
	// be cancelled now, not after a 1.5s server start it would otherwise race
	holders++;
	cancelIdleStop();
	const client = await typstClient(root);
	if (!client) {
		releaseTypstLsp();
		return null;
	}
	// our F2 first: the client's renameKeymap binds the same key to a rename that drops every edit
	// outside the open file (see typst/rename.ts)
	const { typstRenameKeymap } = await import('./actions/rename');
	// the plugin alone: the client already carries its extensions (serverExtensions.ts), and mounting
	// the library's languageServerSupport() on top once registered every extension twice, so each
	// keystroke mapped the completion result twice and the second pass threw
	return [typstRenameKeymap, LSPPlugin.create(client, fileUri(filePath), 'typst'), lspHoverTheme];
}
