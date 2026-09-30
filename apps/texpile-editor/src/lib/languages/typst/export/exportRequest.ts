import { acquireTypstLsp, releaseTypstLsp, typstClientForExport } from '../intellisense/lspClient';
import type { TypstExportJob } from './exportCommand';

/**
 * Run one export on the language server and return tinymist's answer unread, or null without a
 * server. Errors propagate: a failed export is something the user asked for and must hear about.
 *
 * The request gets a timeout of its own. The client's is one number for every request, sized for
 * completions, and a print-resolution image export runs for longer (201 pages at 300 PPI took 28s).
 * The client reads it when the request is queued behind `initializing`, a microtask after the call,
 * so it is put back as soon as that has run and no other request sees it.
 */
export async function requestTypstExport(root: string | null, job: TypstExportJob, timeoutMs: number): Promise<unknown> {
	// held like a preview's: the idle stop after the last .typ editor closes would strand the request
	acquireTypstLsp();
	try {
		const client = await typstClientForExport(root, job.outputPath);
		if (!client) return null;
		await client.initializing;
		const timed = client as unknown as { timeout?: unknown };
		const usual = timed.timeout;
		if (typeof usual === 'number') timed.timeout = Math.max(usual, timeoutMs);
		const pending = client.request<{ command: string; arguments: unknown[] }, unknown>('workspace/executeCommand', {
			command: job.command,
			arguments: job.arguments
		});
		await Promise.resolve();
		if (typeof usual === 'number') timed.timeout = usual;
		return await pending;
	} finally {
		releaseTypstLsp();
	}
}
