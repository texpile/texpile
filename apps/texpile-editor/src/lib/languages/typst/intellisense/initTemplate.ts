// A new project from a Typst Universe template, through tinymist's own `tinymist.doInitTemplate`:
// the server downloads the package (into Typst's package cache, where a compile finds it again) and
// copies the template's files out into `dir`. Arguments are [package spec, absolute folder] and the
// answer is { entryPath }, the template's entry file relative to that folder (checked against
// tinymist 0.15).
import { typstClient } from './lspClient';

// the client gives every request 10 seconds, and a first download of a large template can take
// longer. The server carries on regardless, so asking again (into a fresh folder) picks up the
// package it has meanwhile finished caching
const TIMEOUT_RETRIES = 5;

export class TemplateInitError extends Error {}

type InitResult = { entryPath?: string } | null;

function errorText(e: unknown): string {
	if (e instanceof Error) return e.message;
	if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
	return String(e);
}

/**
 * Unpack `spec` (e.g. "@preview/charged-ieee:0.1.4") into the empty folder `nextDir()` returns,
 * and resolve to the absolute folder and the entry file inside it. `nextDir` is asked again for
 * each retry: tinymist refuses a folder that is not empty, and a timed-out attempt may still be
 * writing into the last one.
 */
export async function initTypstTemplate(
	root: string,
	spec: string,
	nextDir: () => Promise<string>
): Promise<{ dir: string; entryPath: string }> {
	const client = await typstClient(root);
	if (!client) throw new TemplateInitError('tinymist is not available');
	for (let attempt = 0; ; attempt++) {
		const dir = await nextDir();
		try {
			const res = await client.request<{ command: string; arguments: unknown[] }, InitResult>('workspace/executeCommand', {
				command: 'tinymist.doInitTemplate',
				arguments: [spec, dir]
			});
			if (!res?.entryPath) throw new TemplateInitError('tinymist did not say which file the template opens on');
			return { dir, entryPath: res.entryPath };
		} catch (e) {
			const text = errorText(e);
			if (text === 'Request timed out' && attempt < TIMEOUT_RETRIES) continue;
			throw e instanceof TemplateInitError ? e : new TemplateInitError(text, { cause: e });
		}
	}
}
