// The tools that change a document through suggestions: making one, and deciding one
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { relayer, type TargetWindow } from './relay';
import { byArg, pickArgs, rootArg } from './commentTools';

export function registerSuggestTools(server: McpServer, target: TargetWindow): void {
	const relay = relayer(target);

	server.registerTool(
		'suggest_edit',
		{
			title: 'Suggest an edit',
			description:
				'Put a change into the open file as a suggestion under your name: the new words go in, the old ones ' +
				'show struck through, and the reader accepts or rejects it. Use it for wording the author should ' +
				'review (a rewrite, a grammar fix, a fix for a compile error), and your own file tools for mechanical ' +
				'edits. The quote must match the editor buffer exactly, markup included, and be found once; pass ' +
				'prefix, suffix or line to pick between copies. Only the file open in the editor takes suggestions, so ' +
				'open_file first. Refused when the replacement cites a key the bibliography does not have or drops a ' +
				'\\label. Replies with the suggestion id; get_comments reports its decision once the reader acts on it.',
			inputSchema: {
				path: z.string().describe('workspace-relative path of the open file'),
				quote: z.string().describe('the exact text to replace, as the file has it'),
				replacement: z.string().describe('the new text; empty to suggest deleting the quote'),
				note: z.string().optional().describe('a few words shown on the suggestion, such as "shorter" or "fixes the undefined reference"'),
				...pickArgs,
				by: byArg,
				root: rootArg
			}
		},
		// longer than the default wait: a visual editor re-reads the changed paragraph before it can answer
		({ path: p, quote, replacement, note, prefix, suffix, line, by, root }) =>
			relay(root, 'suggest_edit', { path: p, quote, replacement, note, prefix, suffix, line, by }, 10000)
	);

	server.registerTool(
		'decide_suggestion',
		{
			title: 'Accept or reject a suggestion',
			description:
				'Decide a pending suggestion, as the Accept and Reject buttons on its card do, recorded under your ' +
				'name. accept keeps the new words; reject puts the old words back, which the editor does in the open ' +
				'file only, so open_file its file first. Thread ids come from get_comments, where a suggestion has ' +
				'suggestion set. Decide only what the user asked you to: a suggestion is theirs to review.',
			inputSchema: {
				thread: z.string().describe('suggestion thread id, from get_comments'),
				decision: z.enum(['accept', 'reject']),
				by: byArg,
				root: rootArg
			}
		},
		// longer than the default wait: a reject edits the open file and waits for the editor to settle
		({ thread, decision, by, root }) => relay(root, 'suggestion_decide', { thread, decision, by }, 10000)
	);
}
