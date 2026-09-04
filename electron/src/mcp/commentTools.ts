// The review-comment tools: read the threads, and the four writes that touch only the comment log.
// Each is a request the renderer can refuse, and the refusal is passed through whole: an ambiguous
// quote comes back with the lines of its copies, which is what lets the caller try again with a
// prefix or a line instead of guessing.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserWindow } from 'electron';
import { z } from 'zod';
import { askRenderer } from './bridge';
import { fail, ok, refused } from './toolReply';

/** the window a tool acts on; root picks one when several are open */
type TargetWindow = (root?: string) => { win: BrowserWindow } | null;
type Answer = { ok?: boolean; reason?: string } | null;

const rootArg = z.string().optional().describe('workspace root; defaults to the focused window');
const byArg = z.string().optional().describe("your own name, shown as the author; defaults to 'AI assistant'");
const pickArgs = {
	prefix: z.string().optional().describe('text right before the quote, to pick between copies'),
	suffix: z.string().optional().describe('text right after the quote, to pick between copies'),
	line: z.number().int().positive().optional().describe('1-based line the quote starts on, to pick between copies')
};

export function registerCommentTools(server: McpServer, target: TargetWindow): void {
	/** ask the renderer and pass its answer through, refusal and all */
	async function relay(root: string | undefined, kind: string, args: Record<string, unknown>, timeoutMs?: number) {
		const t = target(root);
		if (!t) return fail('no matching Texpile window');
		const r = (await askRenderer(t.win, kind, args, timeoutMs)) as Answer;
		if (r === null) return fail('the editor did not respond in time');
		if (!r.ok) return refused(r);
		return ok(r);
	}

	server.registerTool(
		'get_comments',
		{
			title: 'Get review comments',
			description:
				'The review threads in the workspace: file, the quoted text, every message, and where each ' +
				'thread sits NOW - placed is a 1-based line range, resolved against the editor buffer for the ' +
				'open file and against disk for the others, and null means detached: the quote is gone from ' +
				'the file. placed.match says how it was found: exact (nothing moved), relocated (moved, with ' +
				'its surroundings intact), or weak (found, but the words around it changed - if that sentence ' +
				'appears more than once in the file this may be another copy, so check it is the one meant ' +
				'before acting, and reanchor or reply if not). Open threads only unless includeResolved is ' +
				'set; total and open follow the path filter. Call this before editing a file that has ' +
				'threads, since they are pinned to the quoted text and an edit that rewrites it detaches ' +
				'them. unsaved:true means the lines refer to the open buffer, not the file on disk.',
			inputSchema: {
				path: z.string().optional().describe('workspace-relative file to filter to; omit for the whole workspace'),
				includeResolved: z.boolean().optional().describe('also list resolved threads; default false'),
				root: rootArg
			}
		},
		// longer than the default wait: every commented file is read and searched
		({ path: p, includeResolved, root }) => relay(root, 'comments', { path: p, includeResolved }, 5000)
	);

	server.registerTool(
		'add_comment',
		{
			title: 'Add a review comment',
			description:
				'Open a new thread on a quote in a file, as a review note of your own. The quote has to be ' +
				'found exactly once: it is matched against the editor buffer for the open file and disk ' +
				'otherwise, and a quote copied across a line wrap still matches. When it appears more than ' +
				'once the refusal lists the candidate lines; pass prefix, suffix or line to pick one. Refused ' +
				'rather than guessed when the quote is missing, too short or too common. Not for replacing a ' +
				'thread you could not reanchor: reply to and resolve that one instead.',
			inputSchema: {
				path: z.string().describe('workspace-relative path, e.g. sections/method.tex'),
				quote: z.string().describe('the exact text the comment is about'),
				body: z.string().describe('the comment'),
				...pickArgs,
				by: byArg,
				root: rootArg
			}
		},
		({ path: p, quote, body, prefix, suffix, line, by, root }) =>
			relay(root, 'comment_add', { path: p, quote, body, prefix, suffix, line, by }, 5000)
	);

	server.registerTool(
		'reply_to_comment',
		{
			title: 'Reply to a review comment',
			description:
				'Append a message to a thread. Say what you changed, or why you did not, so the person who ' +
				'left the comment sees it in the panel. Thread ids come from get_comments.',
			inputSchema: {
				thread: z.string().describe('thread id, from get_comments'),
				body: z.string().describe('the reply'),
				by: byArg,
				root: rootArg
			}
		},
		({ thread, body, by, root }) => relay(root, 'comment_reply', { thread, body, by })
	);

	server.registerTool(
		'resolve_comment',
		{
			title: 'Resolve a review comment',
			description:
				'Mark a thread resolved, or reopen it with resolved:false. Use it once your edit has ' +
				'addressed the thread, and reply first so the resolution is not silent. A resolved thread ' +
				'stays in the panel under its filter; nothing is deleted.',
			inputSchema: {
				thread: z.string().describe('thread id, from get_comments'),
				resolved: z.boolean().optional().describe('default true; false reopens'),
				by: byArg,
				root: rootArg
			}
		},
		({ thread, resolved, by, root }) => relay(root, 'comment_resolve', { thread, resolved, by })
	);

	server.registerTool(
		'reanchor_comment',
		{
			title: 'Re-attach a review comment to new text',
			description:
				'Pin an existing thread to a different quote, after an edit rewrote the text it sat on or ' +
				'moved it to another file. Same matching rules as add_comment: found exactly once, else ' +
				'refused with the candidate lines. When nothing in the file is that thread any more, do not ' +
				'force it: reply and resolve if your edit addressed it, or leave it detached with a reply ' +
				'saying why.',
			inputSchema: {
				thread: z.string().describe('thread id, from get_comments'),
				quote: z.string().describe('the text the thread is about now'),
				path: z.string().optional().describe("workspace-relative path; defaults to the thread's current file"),
				...pickArgs,
				by: byArg,
				root: rootArg
			}
		},
		({ thread, quote, path: p, prefix, suffix, line, by, root }) =>
			relay(root, 'comment_reanchor', { thread, quote, path: p, prefix, suffix, line, by }, 5000)
	);
}
