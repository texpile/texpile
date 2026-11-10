// Stream one release archive to disk, hashing it on the way, so the checksum costs no second read
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { InstallError } from './installError';

// a connection that stops sending is not an error on its own; without a limit the install waits for ever
const STALL_MS = 30_000;

export type FetchArchive = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export type DownloadProgress = { received: number; total: number };

/**
 * Download `url` into `file`, resolving to the SHA-256 of what was written (lowercase hex).
 *
 * `signal` is the user's Cancel. A request that never reaches the server is `offline`; one the
 * server refuses, or that dies partway, is `download`; a write the disk refuses is `disk`.
 */
export async function downloadArchive(
	fetchArchive: FetchArchive,
	url: string,
	file: string,
	signal: AbortSignal,
	onProgress: (p: DownloadProgress) => void
): Promise<string> {
	const stall = new AbortController();
	const both = AbortSignal.any([signal, stall.signal]);
	let timer = setTimeout(() => stall.abort(), STALL_MS);
	function heardFrom(): void {
		clearTimeout(timer);
		timer = setTimeout(() => stall.abort(), STALL_MS);
	}
	try {
		const res = await requestArchive(fetchArchive, url, both, signal);
		if (!res.ok || !res.body) throw new InstallError('download', `HTTP ${res.status}`);
		// an encoded body arrives decoded, and its length no longer says how much to expect
		const total = res.headers.get('content-encoding') ? 0 : Number(res.headers.get('content-length')) || 0;
		const hash = createHash('sha256');
		let received = 0;
		onProgress({ received, total });
		await pipeline(
			Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>),
			async function* (source: AsyncIterable<Buffer>) {
				for await (const chunk of source) {
					heardFrom();
					hash.update(chunk);
					received += chunk.length;
					onProgress({ received, total });
					yield chunk;
				}
			},
			fs.createWriteStream(file),
			{ signal: both }
		).catch((err: unknown) => {
			throw streamFailure(err, signal, stall.signal);
		});
		if (total && received !== total) throw new InstallError('download', `received ${received} of ${total} bytes`);
		return hash.digest('hex');
	} finally {
		clearTimeout(timer);
	}
}

async function requestArchive(fetchArchive: FetchArchive, url: string, both: AbortSignal, cancel: AbortSignal): Promise<Response> {
	try {
		return await fetchArchive(url, { signal: both });
	} catch (err) {
		if (cancel.aborted) throw new InstallError('cancelled', 'cancelled');
		const message = err instanceof Error ? err.message : String(err);
		// something answered, only not as dl.texpile.com (an intercepting proxy): show its error, not "offline"
		const refused = /ERR_CERT|ERR_SSL|certificate/i.test(message);
		throw new InstallError(refused ? 'download' : 'offline', message, { cause: err });
	}
}

function streamFailure(err: unknown, cancel: AbortSignal, stall: AbortSignal): InstallError {
	if (err instanceof InstallError) return err;
	if (cancel.aborted) return new InstallError('cancelled', 'cancelled');
	if (stall.aborted) return new InstallError('download', 'the download stalled', { cause: err });
	return InstallError.from(err, 'download');
}
