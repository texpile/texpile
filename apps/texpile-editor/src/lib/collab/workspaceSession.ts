/* eslint-disable no-param-reassign -- attaching handlers means writing the session's handler slots */
// Host-side session wiring, and the doc-state bridge the visual collab layer needs.
//
// VisualCollab owns the remote-patch and presence machinery for the visual editor; it just needs
// read/write access to the workspace's document state, which is what `visualCollabBridge` hands it.
import { observe } from '$lib/runes/observe.svelte';
import { workspaceRoot, isDirty } from '$lib/workspace/workspaceStore';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { previewRelay } from '$lib/collab/previewRelay.svelte';
import { isSafeRel } from '$lib/collab/protocol';
import { noteGuestJumpFreeze } from '$lib/languages/typst/preview/followSignal';
import { resolveGuestSyncRequest } from '$lib/workspace/syncTexNav';
import { serveGuestLspRequest, diagnosticsNotificationForGuest } from '$lib/languages/typst/intellisense/guest/guestLsp';
import {
	typstClient,
	addTypstDiagnosticsListener,
	acquireTypstLsp,
	releaseTypstLsp,
	typstServerGen
} from '$lib/languages/typst/intellisense/lspClient';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import type { EditSession } from '$lib/collab/editSession';
import type { RemoteEdit } from '$lib/workspace/suggestions/suggestionStates';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { VisualParser } from '$lib/workspace/visualParse.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { Node as PMNode } from 'prosemirror-model';

export type VisualCollabBridgeDeps = {
	doc: DocumentBuffer;
	parser: VisualParser;
	parse(text: string): Promise<{ parsed?: ParsedLatexFile }>;
	scheduleSave(path: string, content: string): void;
};

/** the api object VisualCollab reads and writes through */
export function visualCollabBridge(deps: VisualCollabBridgeDeps) {
	const { doc, parser } = deps;
	return {
		get texSource() {
			return doc.texSource;
		},
		set texSource(v: string) {
			doc.texSource = v;
		},
		get lastParsedSource() {
			return parser.lastParsedSource;
		},
		set lastParsedSource(v: string | null) {
			parser.lastParsedSource = v;
		},
		get sourceMap() {
			return doc.sourceMap;
		},
		parse: async (text: string) => (await deps.parse(text)).parsed ?? null,
		adopt(parsed: ParsedLatexFile, liveDoc: PMNode) {
			doc.docMeta = { preamble: parsed.preamble, postamble: parsed.postamble, hadDocumentEnv: parsed.hadDocumentEnv };
			// reference handshake: the editor sees its own live doc and skips the state swap
			doc.visualDoc = liveDoc;
			doc.lastDoc = liveDoc;
			// what places suggestions, comments and carets on the text
			if (liveDoc.eq(parsed.doc)) doc.sourceMap = parsed.map;
			else doc.restate(liveDoc);
		},
		commit(path: string, content: string) {
			isDirty.current = content !== doc.diskBaseline;
			deps.scheduleSave(path, content);
		},
		textOf: (pm: PMNode) => doc.textOf(pm)
	};
}

export type SessionHandlerDeps = {
	runCompile(): void;
	/** a run is already in flight; guest requests are dropped rather than queued */
	isBusy(): boolean;
	/** a guest changed files on the host's disk (upload / rename / delete) */
	refreshTree(): void;
	expectedPdfPath(): string | null;
	/** a guest's change to a shared file, recorded under their name and mode */
	recordGuestEdit(rel: string, before: string, after: string, edit: RemoteEdit): void;
	/** resolve a guest's typst src -> preview position through the host's tinymist; no-op when no
	 *  preview task is running. `rel` is manifest-relative and already validated. */
	typstScrollForGuest(rel: string, line: number, character: number): void;
};

/** attach the host's handlers for guest requests; returns the teardown, which also ends the
 * session - leaving the workspace must not leave it shared invisibly. */
export function attachSessionHandlers(session: EditSession, deps: SessionHandlerDeps): () => void {
	session.onCompileRequest = () => {
		// Dropped, not queued. Any guest can send these as fast as they like, and overlapping runs
		// fight over the same aux/output files. Returning before the toast too, so a guest holding
		// the compile shortcut cannot bury the host in notifications.
		if (deps.isBusy()) return;
		toaster.info({ title: m.wsview_toast_compile_requested_title(), duration: 3000 });
		deps.runCompile();
	};
	session.onFileOp = () => deps.refreshTree();
	// straight onto collabHost, not the EditSession interface: only the host records guests' edits
	collabHost.onGuestEdit = (rel, before, after, edit) => deps.recordGuestEdit(rel, before, after, edit);
	session.onSyncRequest = async (payload, from) => {
		const root = workspaceRoot.current;
		const pdf = deps.expectedPdfPath();
		if (!root || !pdf) return;
		const reply = await resolveGuestSyncRequest(payload, root, pdf);
		if (reply) collabHost.replyControl(reply, from);
	};
	// A guest's intellisense, answered by this machine's tinymist. On collabHost directly like
	// comments: a guest has no server of its own to answer with, which is the point.
	// Taken on the FIRST guest request rather than at session start: holding a reference eagerly
	// would boot a ~90MB Typst server for a LaTeX-only session, on machines that may not even have
	// tinymist. Released with the session.
	let guestLspHeld = false;
	// A server death zeroes the holder count outright (hookExit), which silently discards the
	// reference this session took. Left uncorrected, the restart a guest request triggers runs
	// unheld, and the host closing its last .typ tab reclaims it under the guests - the same
	// works-then-stops the reference exists to prevent. Gen bumps only on genuine death, so this
	// simply marks the reference as needing re-taking.
	const stopGenWatch = observe(
		() => typstServerGen.current,
		() => {
			guestLspHeld = false;
		}
	);
	collabHost.onLspRequest = async (payload, from) => {
		if (payload.kind !== 'lsp-request') return;
		const root = workspaceRoot.current;
		if (!root) return;
		if (!guestLspHeld) {
			guestLspHeld = true;
			acquireTypstLsp();
		}
		const reply = await serveGuestLspRequest(payload, {
			root,
			client: () => typstClient(root),
			flush: () => collabHost.flushPendingWrites(),
			projectFiles: () => collabHost.sessionTextFiles()
		});
		collabHost.replyControl(reply, from);
	};
	// Diagnostics are pushed, not asked for, so they need their own tap rather than riding the
	// request path. Broadcast: which guest is looking at which file is not tracked, and a
	// diagnostic for a file nobody has open is a few bytes.
	const stopDiagnostics = addTypstDiagnosticsListener((path, diags) => {
		const root = workspaceRoot.current;
		if (!root) return;
		const frame = diagnosticsNotificationForGuest(path, diags, root);
		if (frame) collabHost.broadcastControl(frame);
	});
	collabHost.onTypstScroll = (p, from) => {
		if (!isSafeRel(p.file) || !Number.isFinite(p.line) || !Number.isFinite(p.character) || p.line < 0 || p.character < 0) return;
		// deliver the resulting jump to only the asking guest, and hold it off the host's own pane
		previewRelay.expectJump(from);
		noteGuestJumpFreeze();
		deps.typstScrollForGuest(p.file, Math.floor(p.line), Math.floor(p.character));
	};
	// the Typst preview stream's host end; on collabHost directly like comments, since a guest
	// has no preview task to relay from
	previewRelay.attach();
	return () => {
		session.onCompileRequest = null;
		session.onSyncRequest = null;
		session.onFileOp = null;
		collabHost.onGuestEdit = null;
		collabHost.onTypstScroll = null;
		collabHost.onLspRequest = null;
		stopGenWatch();
		if (guestLspHeld) releaseTypstLsp();
		stopDiagnostics();
		previewRelay.detach();
		void session.end();
	};
}
