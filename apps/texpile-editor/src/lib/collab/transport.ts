// Relay transport: a WebSocket that speaks sealed binary frames plus plaintext relay notices.
// Endpoint-agnostic on purpose — the session layer never knows whether the far side is the
// local Node relay, the Cloudflare DO, or (in tests) an in-process fake.

import { parseRelayNotice, type RelayNotice } from './protocol';

export type TransportStatus = 'connecting' | 'connected' | 'disconnected' | 'closed';

export interface Transport {
	send(data: Uint8Array): void;
	close(): void;
	/** fromHost = the relay stamped this frame as coming from the authenticated host socket. */
	onMessage: ((data: Uint8Array, fromHost: boolean) => void) | null;
	onNotice: ((n: RelayNotice) => void) | null;
	onStatus: ((s: TransportStatus, detail?: string) => void) | null;
}

/** ws(s):// -> http(s):// for the relay's REST half. */
export function relayHttpUrl(wsUrl: string): string {
	return wsUrl.replace(/^ws/i, 'http');
}

/** registers the room with the relay; the relay stores only hashes. */
export async function createRelaySession(wsUrl: string, body: { room: string; proofHash: string; hostKeyHash: string }): Promise<void> {
	const res = await fetch(`${relayHttpUrl(wsUrl).replace(/\/+$/, '')}/session`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (res.status === 409) throw new Error('relay-room-conflict');
	if (res.status !== 201) throw new Error(`relay refused the session (${res.status})`);
}

// close codes after which reconnecting is pointless (mirrors the relay's limits.js):
// 4001 session-end, 4003 bad proof / no session, 4006 full, 4010 quota
const FATAL_CLOSES = new Set([4001, 4003, 4006, 4010]);
const MAX_BACKOFF_MS = 15_000;

export class RelayTransport implements Transport {
	onMessage: ((data: Uint8Array, fromHost: boolean) => void) | null = null;
	onNotice: ((n: RelayNotice) => void) | null = null;
	onStatus: ((s: TransportStatus, detail?: string) => void) | null = null;

	private ws: WebSocket | null = null;
	private closed = false;
	private attempt = 0;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly url: string,
		private readonly roomId: string,
		private readonly joinProof: string,
		private readonly hostKey?: string
	) {}

	connect(): void {
		if (this.closed) return;
		this.onStatus?.('connecting');
		const base = this.url.replace(/\/+$/, '');
		// secrets ride the Sec-WebSocket-Protocol header, not the URL, so proxies/CDNs don't log
		// them in the request line. hex values are valid subprotocol tokens.
		const protocols = this.hostKey ? [this.joinProof, this.hostKey] : [this.joinProof];
		let ws: WebSocket;
		try {
			ws = new WebSocket(`${base}/session/${this.roomId}`, protocols);
		} catch {
			this.scheduleRetry();
			return;
		}
		ws.binaryType = 'arraybuffer';
		this.ws = ws;
		ws.onopen = () => {
			this.attempt = 0;
			this.onStatus?.('connected');
		};
		ws.onmessage = (ev) => {
			if (typeof ev.data === 'string') {
				const n = parseRelayNotice(ev.data);
				if (n) this.onNotice?.(n);
			} else {
				// [1-byte origin marker][sealed frame]
				const buf = new Uint8Array(ev.data as ArrayBuffer);
				if (buf.byteLength >= 1) this.onMessage?.(buf.subarray(1), buf[0] === 1);
			}
		};
		ws.onclose = (ev) => {
			if (this.ws !== ws) return;
			this.ws = null;
			if (this.closed) return;
			if (FATAL_CLOSES.has(ev.code)) {
				this.closed = true;
				this.onStatus?.('closed', String(ev.code));
				return;
			}
			this.onStatus?.('disconnected');
			this.scheduleRetry();
		};
		// onclose fires after onerror; retry handling lives there
		ws.onerror = () => {};
	}

	private scheduleRetry(): void {
		if (this.closed || this.retryTimer) return;
		const delay = Math.min(1000 * 2 ** this.attempt++, MAX_BACKOFF_MS);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.connect();
		}, delay);
	}

	send(data: Uint8Array): void {
		// drops while disconnected are fine: the session re-runs its sync handshake on reconnect
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
	}

	close(): void {
		this.closed = true;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
		this.ws?.close();
		this.ws = null;
	}
}
