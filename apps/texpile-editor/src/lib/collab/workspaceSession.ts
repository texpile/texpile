// Host-side session wiring, and the doc-state bridge the visual collab layer needs.
//
// VisualCollab owns the remote-patch and presence machinery for the visual editor; it just needs
// read/write access to the workspace's document state, which is what `visualCollabBridge` hands it.
import { get } from 'svelte/store';
import { workspaceRoot, isDirty } from '$lib/workspace/workspaceStore';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { resolveGuestSyncRequest } from '$lib/workspace/syncTexNav';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';
import type { EditSession } from '$lib/collab/editSession';
import type { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { VisualParser } from '$lib/workspace/visualParse.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { Node as PMNode } from 'prosemirror-model';

export interface VisualCollabBridgeDeps {
	doc: DocumentBuffer;
	parser: VisualParser;
	parse(text: string): Promise<{ parsed?: ParsedLatexFile }>;
	scheduleSave(path: string, content: string): void;
}

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
		set lastParsedSource(v: string) {
			parser.lastParsedSource = v;
		},
		get docMeta() {
			return doc.docMeta;
		},
		parse: async (text: string) => (await deps.parse(text)).parsed ?? null,
		adopt(parsed: ParsedLatexFile, liveDoc: PMNode) {
			doc.docMeta = { preamble: parsed.preamble, postamble: parsed.postamble, hadDocumentEnv: parsed.hadDocumentEnv };
			// reference handshake: the editor sees its own live doc and skips the state swap
			doc.visualDoc = liveDoc;
			doc.lastDoc = liveDoc;
		},
		commit(path: string, content: string) {
			isDirty.set(true);
			deps.scheduleSave(path, content);
		}
	};
}

export interface SessionHandlerDeps {
	runCompile(): void;
	/** a guest changed files on the host's disk (upload / rename / delete) */
	refreshTree(): void;
	expectedPdfPath(): string | null;
}

/** attach the host's handlers for guest requests; returns the teardown, which also ends the
 * session - leaving the workspace must not leave it shared invisibly. */
export function attachSessionHandlers(session: EditSession, deps: SessionHandlerDeps): () => void {
	session.onCompileRequest = () => {
		toaster.info({ title: m.wsview_toast_compile_requested_title(), duration: 3000 });
		deps.runCompile();
	};
	session.onFileOp = () => deps.refreshTree();
	session.onSyncRequest = async (payload, from) => {
		const root = get(workspaceRoot);
		const pdf = deps.expectedPdfPath();
		if (!root || !pdf) return;
		const reply = await resolveGuestSyncRequest(payload, root, pdf);
		if (reply) collabHost.replyControl(reply, from);
	};
	return () => {
		session.onCompileRequest = null;
		session.onSyncRequest = null;
		session.onFileOp = null;
		void session.end();
	};
}
