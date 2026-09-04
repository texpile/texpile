// The MCP tool surface: what the server tells a client at initialize, and every registered tool.
// Nothing here mutates a document, deliberately - see server.ts for the hosting story. The comment
// tools write the review log in .texpile only.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { snapshotWindows, type WorkspaceSnapshot } from './windowState';
import { askRenderer, sendCommand } from './bridge';
import { registerCommentTools } from './commentTools';
import { fail, ok } from './toolReply';
import type { McpHost } from './server';

/**
 * Sent at initialize and injected into the client's context, so it is read once per session and
 * costs tokens every time - it holds only what changes what a caller DOES, not what Texpile is.
 * Everything here is something an agent gets wrong by default: writing over a buffer the user has
 * edited, quoting a line number at a window that is not showing lines, or treating a view change as
 * free when the user is sitting in front of it.
 */
const INSTRUCTIONS = [
	'Texpile is a local, offline LaTeX editor. It opens a FOLDER of .tex files, and the file on disk IS the document:',
	'no database, no document ids, and saving writes the .tex back in place.',
	'',
	'Nothing on this server writes a document, deliberately. Your own file tools are better at that. What this gives',
	'you instead is the state of the editor the user is actually looking at, and the ability to steer it.',
	'',
	'Before you read a .tex from disk, check get_editor_state. A tab marked dirty means the editor holds newer content',
	'than the file, and get_unsaved returns it; writing over a dirty file raises a conflict prompt at the user rather',
	'than applying cleanly.',
	'',
	'Line numbers only mean anything in Source view. In Visual view the caret is a ProseMirror position that does not',
	'map to a line, and get_editor_state honestly reports null rather than guessing.',
	'',
	'The window belongs to the user. open_file, set_view_mode and show_diff all change what is on their screen, so',
	'use them when you have something worth showing, not to mirror your own progress.',
	'',
	'If a compile fails because the wrong file is main, or none is set, set_main_file fixes it and you can retry.',
	'',
	'Do not infer where a build lands from the compile command. A folder can override the PDF and log paths',
	'independently of it, which is normal in a repo where one output directory serves several documents, so',
	'get_compile_config reports the resolved paths and set_output_paths is what changes them.',
	'',
	'Review comments live in .texpile/comments.jsonl, pinned to the exact text they quote. Rewriting a quoted',
	'sentence detaches its thread, and a detached thread reads as lost, not as done. So before editing a file, call',
	'get_comments for it. When your edit addresses a thread, reply_to_comment with what changed, then resolve_comment.',
	'When it rewrites the quoted text but the thread should stay open, reanchor_comment it onto the new text; after',
	'renaming a file, reanchor its threads with the new path. Never write comments.jsonl yourself: the editor holds',
	'it in memory and its next append overwrites your line, and nothing written straight to disk reaches guests in',
	'a shared session. add_comment is for review notes of your own, not a replacement for a thread you could not',
	'reanchor - reply to and resolve that one, or leave it detached with a reply saying why. Pass your own name as',
	'by on every comment write; it is shown as the author. A thread get_comments marks weak was found, but the words',
	'around it changed: check it is the sentence meant before acting on it.'
].join('\n');

export function buildServer(currentHost: () => McpHost | null): McpServer {
	const server = new McpServer({ name: 'texpile', version: '1' }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });

	server.registerTool(
		'get_editor_state',
		{
			title: 'Get Texpile editor state',
			description:
				'What Texpile is showing right now: every open workspace window, its tabs and which have ' +
				'unsaved changes, the active file, view mode, caret and selection. Use this to work on what ' +
				'the user is actually looking at. Prefer the workspace whose root matches your working ' +
				'directory over the focused one, since focus changes when the user clicks another window. ' +
				'Note livePreview: when true the user is not running their compile command at all, so ' +
				'compile only nudges an engine already going, the PDF is _draft/draft.pdf rather than the ' +
				'one their command would produce, and diagnostics come from that engine.',
			inputSchema: {}
		},
		async () => {
			const h = currentHost();
			if (!h) return fail('server not running');
			const workspaces: WorkspaceSnapshot[] = snapshotWindows(h.windowObjects(), (id) => h.rootFor(id));
			const focused = workspaces.find((w) => w.focused)?.root ?? null;
			return {
				content: [{ type: 'text' as const, text: JSON.stringify({ focused, workspaces }, null, 2) }]
			};
		}
	);

	/** every tool below needs a window; root picks one when several are open */
	function target(root?: string) {
		return currentHost()?.windowFor(root) ?? null;
	}

	server.registerTool(
		'get_unsaved',
		{
			title: 'Get unsaved editor content',
			description:
				'The in-editor text of the active file when it has unsaved changes. Call this whenever ' +
				'get_editor_state reports a dirty tab: the copy on disk is stale, so reading the file would ' +
				'give you older content than the user is looking at. Returns dirty:false and no content when ' +
				'nothing is unsaved, in which case read the file from disk as normal.',
			inputSchema: { root: z.string().optional().describe('workspace root; defaults to the focused window') }
		},
		async ({ root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			// pulled rather than pushed: a dirty 2 MB paper is not worth sending on every keystroke
			const data = await askRenderer(t.win, 'unsaved');
			if (data === null) return fail('the editor did not respond in time (it may be busy loading a large document)');
			return ok(data);
		}
	);

	server.registerTool(
		'get_diagnostics',
		{
			title: 'Get compile errors and warnings',
			description:
				'Errors and warnings parsed from a compile, with file and line. It compiles nothing itself, ' +
				'so ALWAYS check which run you are being handed: compiling:true means a compile is in ' +
				'flight and everything here predates it, and logWrittenAt says when the .log this came from ' +
				'was written. endSignal says how the end of a run is detected: shell-exit is trustworthy, ' +
				'while log-quiet is inferred from the log going still and can flip compiling to false ' +
				'during a long between-pass pause - if you see log-quiet, confirm logWrittenAt has stopped ' +
				'moving across two polls a few seconds apart before treating the numbers as final. ' +
				'Reading straight after calling compile, without checking those, gets you the ' +
				'PREVIOUS run - errors rarely differ between two runs so it looks right, while status.pages ' +
				'quietly describes the document you had before. In live-preview mode (live:true) no shell ' +
				'compile runs at all, so this can be whatever .log was left in the folder, however old.',
			inputSchema: { root: z.string().optional().describe('workspace root; defaults to the focused window') }
		},
		async ({ root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			const data = await askRenderer(t.win, 'diagnostics');
			if (data === null) return fail('the editor did not respond in time');
			return ok(data);
		}
	);

	server.registerTool(
		'open_file',
		{
			title: 'Open a file in Texpile',
			description:
				'Bring a file in the workspace forward in the editor, optionally at a line. NOTE: passing a ' +
				'line switches the window to Source mode, because a line number only means anything there - ' +
				'omit it to open the file without changing how the user is viewing their document. Paths are ' +
				'workspace-relative.',
			inputSchema: {
				path: z.string().describe('workspace-relative path, e.g. sections/method.tex'),
				line: z.number().int().positive().optional().describe('1-based line; switches to Source mode'),
				root: z.string().optional().describe('workspace root; defaults to the focused window')
			}
		},
		async ({ path: p, line, root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			// The renderer resolves this against the workspace tree, not the filesystem. That is the
			// whole containment story for this server: it is the only tool taking a path, and the path
			// never reaches the fs service.
			sendCommand(t.win, { kind: 'open_file', path: p, line });
			return ok({ opened: p, line: line ?? null, switchedToSource: line !== undefined });
		}
	);

	server.registerTool(
		'show_diff',
		{
			title: 'Show a file diff in Texpile',
			description:
				"Switch the window to Diff view, showing the file's working changes against git HEAD. Useful " +
				'after you have edited files, so the user can see what changed. This changes what is on ' +
				'screen, so use it when you have something worth showing, not speculatively.',
			inputSchema: {
				path: z.string().optional().describe('workspace-relative path; defaults to the active file'),
				root: z.string().optional().describe('workspace root; defaults to the focused window')
			}
		},
		async ({ path: p, root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			// a request, not a command: entering diff is refused outright when the folder is not a git
			// repo, and reporting success we never confirmed is how a caller gets misled
			const r = (await askRenderer(t.win, 'show_diff', { path: p })) as { ok?: boolean; reason?: string } | null;
			if (r === null) return fail('the editor did not respond in time');
			if (!r.ok) return fail(r.reason ?? 'the editor refused to show a diff');
			return ok(r);
		}
	);

	server.registerTool(
		'set_view_mode',
		{
			title: 'Set the Texpile view mode',
			description:
				'Switch between Visual (WYSIWYG), Source (LaTeX) and Diff. Changes what the user sees, so ' +
				'prefer leaving it alone unless the mode is the point - for example switching to Source ' +
				'before pointing at a specific line.',
			inputSchema: {
				mode: z.enum(['visual', 'source', 'diff']),
				root: z.string().optional().describe('workspace root; defaults to the focused window')
			}
		},
		async ({ mode, root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			const r = (await askRenderer(t.win, 'view_mode', { mode })) as { ok?: boolean; reason?: string; viewMode?: string } | null;
			if (r === null) return fail('the editor did not respond in time');
			if (!r.ok) return fail(`${r.reason ?? 'refused'} (still in ${r.viewMode ?? 'unknown'} mode)`);
			return ok(r);
		}
	);

	server.registerTool(
		'synctex_to_line',
		{
			title: 'Show a source line in the PDF',
			description:
				'Forward sync: scroll the output pane to where a line of the open file renders, and open the ' +
				'pane if it is closed. This is the good way to point at something, because the user keeps ' +
				'reading their document while seeing the typeset result. LaTeX files need a compiled PDF with ' +
				'SyncTeX data (approximate if the file changed since the last compile); Typst files jump the ' +
				'live Preview pane instead, which must be running - Typst has no SyncTeX.',
			inputSchema: {
				line: z.number().int().positive().describe('1-based line in the currently open file'),
				root: z.string().optional().describe('workspace root; defaults to the focused window')
			}
		},
		async ({ line, root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			const r = (await askRenderer(t.win, 'synctex', { line })) as { ok?: boolean; reason?: string } | null;
			if (r === null) return fail('the editor did not respond in time');
			if (!r.ok) return fail(r.reason ?? 'could not sync to that line');
			return ok(r);
		}
	);

	server.registerTool(
		'set_main_file',
		{
			title: 'Set the project main file',
			description:
				'Point the project at the file that gets compiled: the .tex with \\documentclass and ' +
				'\\begin{document}, or the entry .typ of a Typst project. This is also the root of the macro ' +
				'scan, so it decides which command definitions the editor knows about across the project. With ' +
				'the compile format on Auto, the extension also picks the typesetter: a .typ main compiles with ' +
				'Typst, a .tex main with the LaTeX command (get_compile_config reports the format in effect). ' +
				'get_editor_state reports the current main. Omit path to clear it. Setting the file that is ' +
				'already main is a no-op, not a toggle. Reach for this when compile fails because the wrong ' +
				'file is main, or none is set.',
			inputSchema: {
				path: z.string().optional().describe('workspace-relative .tex or .typ path; omit to clear'),
				root: z.string().optional().describe('workspace root; defaults to the focused window')
			}
		},
		async ({ path: p, root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			// a request, not a command: a path outside the workspace or one that is not a .tex/.typ is
			// refused, and a caller told it succeeded would compile the wrong thing and never learn why
			const r = (await askRenderer(t.win, 'main_file', { path: p })) as { ok?: boolean; reason?: string } | null;
			if (r === null) return fail('the editor did not respond in time');
			if (!r.ok) return fail(r.reason ?? 'the editor refused to set the main file');
			return ok(r);
		}
	);

	server.registerTool(
		'compile',
		{
			title: 'Compile the document',
			description:
				"Run the project's configured compile, exactly as the toolbar button does. Returns as soon as " +
				'it starts, since a compile takes seconds to minutes - so the reply is NOT a result. To get ' +
				'the result, poll get_diagnostics until compiling is false; that same reply then already ' +
				'contains the results of this run (diagnostics are published before the run is marked ' +
				'finished, and that holds even when latexmk found the build up to date and re-ran nothing). ' +
				'In live mode the preview is already recompiling incrementally and this only nudges it. Runs ' +
				'in its own terminal either way and does not take over whatever shell the user is in.',
			// No engine and no flags, deliberately. The compile runs with -no-shell-escape, which is the
			// only thing standing between "compile a .tex file" and arbitrary code execution; a flags
			// passthrough would hand that to anything able to write a .tex file, including the caller.
			inputSchema: { root: z.string().optional().describe('workspace root; defaults to the focused window') }
		},
		async ({ root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			const r = (await askRenderer(t.win, 'compile')) as { ok?: boolean; mode?: string; note?: string } | null;
			if (r === null) return fail('the editor did not respond in time');
			// pass the renderer's own mode and guidance through rather than restating it here, so the
			// two cannot drift apart
			return ok(r);
		}
	);

	server.registerTool(
		'get_compile_config',
		{
			title: 'Get the compile configuration',
			description:
				'The compile command, its format (latex or typst), the engine, the output directory, and - the ' +
				'part worth having - the RESOLVED paths the PDF pane and the log parser actually watch. In a monorepo those are ' +
				'routinely not what the command implies, because a folder can override either one. Read this ' +
				'before assuming where a build landed. canSetCommand tells you whether set_compile_command is ' +
				'permitted here, so you can pick a route without provoking a refusal.',
			inputSchema: { root: z.string().optional().describe('workspace root; defaults to the focused window') }
		},
		async ({ root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			const data = await askRenderer(t.win, 'compile_config');
			if (data === null) return fail('the editor did not respond in time');
			return ok(data);
		}
	);

	server.registerTool(
		'set_output_paths',
		{
			title: 'Retarget the build output',
			description:
				'Point the build somewhere else: outputDir changes where the engine writes (the ' +
				'-output-directory flag is substituted into the existing command, leaving its other flags ' +
				'alone), while pdf and log override where the viewer READS, for when the command writes ' +
				'somewhere the editor cannot infer. pdf/log are literal file paths - no {main} - and pass an ' +
				'empty string to clear one. Returns the new resolved configuration.',
			inputSchema: {
				// a directory only, and a restricted one: this value is spliced into a shell command line,
				// so the renderer refuses quotes and metacharacters outright
				outputDir: z.string().optional().describe('directory the engine writes to, e.g. build/paper'),
				pdf: z.string().optional().describe('literal path to the compiled .pdf; empty string clears the override'),
				log: z.string().optional().describe('literal path to the .log; empty string clears the override'),
				root: z.string().optional().describe('workspace root; defaults to the focused window')
			}
		},
		async ({ outputDir, pdf, log, root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			const r = (await askRenderer(t.win, 'set_output_paths', { outputDir, pdf, log })) as { ok?: boolean; reason?: string } | null;
			if (r === null) return fail('the editor did not respond in time');
			if (!r.ok) return fail(r.reason ?? 'the editor refused the change');
			return ok(r);
		}
	);

	server.registerTool(
		'set_compile_command',
		{
			title: 'Set the compile command',
			description:
				"Replace the project's compile command outright - for a wrapper script, a Makefile target, or " +
				'an engine this editor does not generate. Must contain {main}, which expands to the main file. ' +
				'OFF BY DEFAULT: a compile command is a shell command line, so the user has to enable this ' +
				'separately from MCP access, and get_compile_config reports whether they have (canSetCommand). ' +
				'If you only need the build to land elsewhere, use set_output_paths instead - that needs no ' +
				'permission.',
			inputSchema: {
				command: z.string().describe('shell command; {main} expands to the main file path'),
				root: z.string().optional().describe('workspace root; defaults to the focused window')
			}
		},
		async ({ command, root }) => {
			const t = target(root);
			if (!t) return fail('no matching Texpile window');
			// the gate lives in the renderer, with the settings store, so it cannot be bypassed by
			// reaching this server directly
			const r = (await askRenderer(t.win, 'set_compile_command', { command })) as { ok?: boolean; reason?: string } | null;
			if (r === null) return fail('the editor did not respond in time');
			if (!r.ok) return fail(r.reason ?? 'the editor refused to set the compile command');
			return ok(r);
		}
	);

	registerCommentTools(server, target);

	return server;
}
