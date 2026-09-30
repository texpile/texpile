// The guest half of Typst intellisense: an LSP transport whose "server" is the host.
//
// @codemirror/lsp-client only asks a Transport to move JSON-RPC strings, so a guest can run the
// SAME client, extensions and editor wiring as the host and simply be pointed somewhere else. That
// is the whole reason this is a transport rather than a set of bespoke completion sources: the
// intellisense a guest gets is the intellisense the host gets, not a reimplementation of it that
// drifts.
//
// What does NOT cross the wire is document sync. materialize.ts writes a guest's edits through to
// the host's disk, and tinymist picks those writes up on its own even for a file nobody has open
// (measured), so the host's server is already reading what the guest typed. Forwarding didOpen /
// didChange on top of that would be worse than redundant - the host has its own editors on those
// same URIs, and two writers on one document desynchronise it.
import type { Transport } from '@codemirror/lsp-client';
import type { ControlPayload } from '$lib/collab/protocol';

/** How this transport reaches the session. Narrow on purpose, so it can be tested without one. */
export type SessionLspPort = {
	send(payload: ControlPayload): void;
	/** host -> guest LSP traffic; returns an unsubscribe */
	subscribe(handler: (payload: ControlPayload) => void): () => void;
};

/** JSON-RPC internal error, for a request the session could not complete. */
const INTERNAL_ERROR = -32603;

type JsonRpcOut = {
	id?: number | string;
	method?: string;
	params?: unknown;
};

/**
 * A Transport backed by `port`.
 *
 * `timeoutMs` is a backstop under the client's own timeout: a host that goes away mid-request
 * leaves a promise that would otherwise never settle, and an editor whose completions hang is
 * worse than one that has none.
 */
export function createSessionTransport(port: SessionLspPort, timeoutMs = 8000): Transport & { dispose(): void } {
	const handlers = new Set<(value: string) => void>();
	// the method rides along purely so a failure can name itself; a bare id in the console tells
	// nobody which feature just went quiet
	const pending = new Map<number | string, { timer: ReturnType<typeof setTimeout>; method: string }>();

	function emit(msg: unknown) {
		const json = JSON.stringify(msg);
		for (const h of handlers) h(json);
	}

	function settle(id: number | string, body: Record<string, unknown>) {
		// a reply for a request we are no longer waiting on is a late duplicate (it already timed
		// out); dropping it avoids answering an id the client has since reused
		const entry = pending.get(id);
		if (entry === undefined) return;
		clearTimeout(entry.timer);
		pending.delete(id);
		if (body.error) console.warn('[guest-lsp] host could not answer', { id, method: entry.method, error: body.error });
		// what came back decides where a silent popup died: an empty answer is host-side
		// staleness, a full one the client then discards is ours
		else if (entry.method === 'textDocument/completion') {
			const r = body.result as { items?: unknown[] } | unknown[] | null;
			const count = Array.isArray(r) ? r.length : (r?.items?.length ?? 0);
			console.info('[guest-lsp] <-', entry.method, id, `${count} item(s)`);
		}
		emit({ jsonrpc: '2.0', id, ...body });
	}

	const unsubscribe = port.subscribe((payload) => {
		if (payload.kind === 'lsp-notify') {
			// straight into the client as if the server had said it; this is how the guest's
			// squiggles arrive
			emit({ jsonrpc: '2.0', method: payload.method, params: payload.params });
			return;
		}
		if (payload.kind !== 'lsp-result') return;
		settle(
			payload.reqId,
			payload.ok
				? { result: payload.result ?? null }
				: { error: { code: INTERNAL_ERROR, message: payload.error ?? 'the host could not answer' } }
		);
	});

	return {
		send(message: string) {
			let msg: JsonRpcOut;
			try {
				msg = JSON.parse(message);
			} catch {
				return; // not ours to salvage
			}
			const { id, method, params } = msg;

			// EVERY client notification stops here. Document lifecycle is already handled by the
			// write-through; `initialized` and `exit` describe a server lifecycle the guest does not
			// own (a guest closing a tab must not tell the host's server to quit); and
			// `$/cancelRequest` cannot be honoured, because the id it names is this client's, while
			// the host's own client numbers its requests separately - forwarding one would cancel
			// somebody else's request. An uncancelled request just settles and is discarded.
			if (id == null) return;
			if (!method) return; // a response from the client; nothing upstream wants it

			// `shutdown` is answered here rather than forwarded: it means "this client is done",
			// and the host's server serves other people
			if (method === 'shutdown') {
				emit({ jsonrpc: '2.0', id, result: null });
				return;
			}

			// `initialize` goes over too: the host answers it from its own server's cached
			// capabilities rather than re-initialising a server that is already up.
			//
			// info, not debug, on purpose - debug lands in DevTools' Verbose level, which is hidden
			// by default, and a diagnostic nobody can see is not a diagnostic. If this line never
			// prints, the client never asked, and the fault is detection rather than the relay.
			console.info('[guest-lsp] ->', method, id);
			pending.set(id, {
				method,
				timer: setTimeout(() => {
					pending.delete(id);
					console.warn('[guest-lsp] no answer from the host', { id, method, timeoutMs });
					emit({ jsonrpc: '2.0', id, error: { code: INTERNAL_ERROR, message: 'the host did not answer in time' } });
				}, timeoutMs)
			});
			port.send({ kind: 'lsp-request', reqId: id, method, params });
		},
		subscribe(handler: (value: string) => void) {
			handlers.add(handler);
		},
		unsubscribe(handler: (value: string) => void) {
			handlers.delete(handler);
		},
		/** fail everything outstanding; called when the session ends under a live editor */
		dispose() {
			unsubscribe();
			for (const [id, entry] of pending) {
				clearTimeout(entry.timer);
				emit({ jsonrpc: '2.0', id, error: { code: INTERNAL_ERROR, message: 'the session ended' } });
			}
			pending.clear();
			handlers.clear();
		}
	};
}
