// tinymist preview lifecycle commands, sent over the shared LSP client
import { typstClient, acquireTypstLsp, releaseTypstLsp } from '../intellisense/lspClient';

type StartPreviewResponse = {
	staticServerAddr?: string;
	dataPlanePort?: number;
	isPrimary?: boolean;
};

/** Where a started preview can be reached. */
export type TypstPreviewTarget = {
	/**
	 * `host:port` serving both tinymist's preview page and its data plane websocket.
	 *
	 * tinymist puts the HTTP server and the websocket on the same port, which is what lets the page
	 * find its own socket; we pass this host to both the fetch and the substitution.
	 */
	host: string;
	/** the handle for steering this preview afterwards, e.g. killTypstPreview */
	taskId: string;
};

/**
 * Ask the preview to scroll to a source position, so it follows the caret.
 *
 * The reply is empty either way: the server resolves the position against the compiled document and
 * pushes a `jump` frame down the DATA PLANE, which the framed viewer handles itself. If the position
 * does not correspond to anything in the output, tinymist's resolve_source_loc simply returns None
 * and nothing moves - there is no error to surface, so a silent no-op here is expected, not a fault.
 *
 * `line` and `character` are ZERO-based, as in LSP positions. There is deliberately no default for
 * `character`: the server only resolves positions whose syntax leaf (the one ENDING at the cursor)
 * is text, so column 0 - right after a linebreak - never resolves and the call does nothing.
 */
export async function scrollTypstPreview(
	root: string | null,
	taskId: string,
	file: string,
	line: number,
	character: number
): Promise<void> {
	const client = await typstClient(root);
	if (!client) return;
	// the position was measured against the editor's text, so the server's copy must be that text:
	// an edit still waiting on a sync debounce shifts every offset after it
	client.sync();
	try {
		await client.request<{ command: string; arguments: unknown[] }, unknown>('workspace/executeCommand', {
			command: 'tinymist.scrollPreview',
			arguments: [taskId, { event: 'panelScrollTo', filepath: file, line, character }]
		});
	} catch {
		// a preview that has gone away must not break typing
	}
}

/**
 * Stop a preview we started.
 *
 * Closing the websocket only detaches the viewer: the server keeps compiling the document and
 * holding its render state, so without this every open-and-close would leak one live preview into
 * the language server for the rest of the session.
 */
export async function killTypstPreview(root: string | null, taskId: string): Promise<void> {
	const client = await typstClient(root);
	// the reference startTypstPreview took goes back either way: if the client is already gone the
	// preview is gone with it, and holding a count for it would pin a dead server
	try {
		if (client)
			await client.request<{ command: string; arguments: unknown[] }, unknown>('workspace/executeCommand', {
				command: 'tinymist.doKillPreview',
				arguments: [taskId]
			});
	} catch {
		// the server may have dropped the task already (folder switch, server restart); nothing to do
	} finally {
		releaseTypstLsp();
	}
}

/**
 * Start tinymist's incremental preview for `file`.
 *
 * Started through the LANGUAGE SERVER rather than as its own `tinymist preview` process, and that
 * distinction is the whole feature: a standalone preview watches the filesystem, so it would only
 * ever show saved text. Started this way it renders the server's in-memory document, which both
 * editors keep current through textDocument/didChange (the visual one through streamTypstDocument).
 * No save, no file watching.
 *
 * `--data-plane-host 127.0.0.1:0` asks for an ephemeral port, so a second window cannot collide
 * with the default 23625 (the flag is absent from `tinymist preview --help` in 0.15.2 but is
 * accepted here).
 */
export async function startTypstPreview(root: string | null, file: string): Promise<TypstPreviewTarget | null> {
	// A live preview KEEPS THE SERVER ALIVE. Without this the count only ever tracked open .typ
	// source editors, so leaving source mode (a tab switch, or switching to the visual editor)
	// dropped it to zero and reaped tinymist 30s later - out from under a preview still on screen.
	// The viewer then sat on its last render, retrying a refused socket forever, and every jump
	// died with "WebSocket is already in CLOSING or CLOSED state". Released in killTypstPreview.
	acquireTypstLsp();
	const client = await typstClient(root);
	if (!client) {
		releaseTypstLsp();
		return null;
	}
	// The task id is ours to invent - the server just records it - and it is the handle every later
	// command needs, so a preview started without one can be watched but never steered.
	const taskId = `texpile-${Math.random().toString(36).slice(2, 9)}`;
	try {
		const res = await client.request<{ command: string; arguments: unknown[] }, StartPreviewResponse>('workspace/executeCommand', {
			command: 'tinymist.doStartPreview',
			arguments: [['--task-id', taskId, '--data-plane-host', '127.0.0.1:0', '--no-open', file]]
		});
		const host = res?.staticServerAddr ?? (res?.dataPlanePort ? `127.0.0.1:${res.dataPlanePort}` : null);
		// only a preview that actually started keeps its reference; every other exit hands it back,
		// or a failed start would pin the server for the rest of the session
		if (!host) {
			releaseTypstLsp();
			return null;
		}
		return { host, taskId };
	} catch (e) {
		releaseTypstLsp();
		throw e;
	}
}

/**
 * Reformat a .typ through the language server's built-in formatter (typstyle - the same one
 * tinymist's VS Code extension binds Format Document to).
 *
 * `text` must be what the server's in-memory document holds, i.e. the open editor's buffer: the
 * server computes edits against ITS copy, and applying them to anything else would splice at the
 * wrong offsets. The caller gates this to a live source editor, whose LSP binding keeps the two
 * identical via didChange. formatterMode rides ahead with the rest of the server settings (see
 * pushSettings) - tinymist ships with the formatter disabled, and this is the one switch that
 * turns it on. Idempotent, so pushing it per call costs nothing.
 *
 * Returns the formatted document; errors propagate (the caller shows them - a formatter the user
 * invoked must not fail silently).
 */
