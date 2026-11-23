// \input, \include and \subfile drawn as IncludeDocDisplay drew them: the command as it reads in LaTeX, its path in the
// reference color and red when the project has no such file; a click opens the file
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasNodeViewConstructor, StyleLook } from '$lib/editor/canvas';
import { setLook } from '$lib/editor/canvas';
import { liveRefProblems } from '$lib/workspace/document/liveRefChecks.svelte';
import { refProblemText } from '$lib/workspace/document/liveRefDiagnostics';
import { openFile, texFiles } from '$lib/workspace/workspaceStore';
import { samePath } from '$lib/workspace/fileSystem';
import { resolveIncludePaths } from './includePaths';

const CHIP_LOOK: StyleLook = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.3rem',
	margin: '0.4rem 0',
	padding: '0.1rem 0.3rem',
	borderRadius: 'var(--radius-base)',
	fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
	fontSize: '11px',
	cursor: 'pointer'
};
const ICON_LOOK: StyleLook = { width: '0.875rem', height: '0.875rem', flexShrink: '0', opacity: '0.55' };
const SYNTAX_LOOK: StyleLook = { color: 'var(--muted-text)' };
const PATH_LOOK: StyleLook = { fontWeight: '600', color: 'var(--ref-fg)' };
const MISSING_LOOK: StyleLook = {
	...PATH_LOOK,
	color: 'var(--color-ref-broken-fg)',
	textDecoration: 'underline wavy',
	textDecorationThickness: '1px'
};

function openInclude(node: PMNode, baseDir: () => string): void {
	const rawPath = String(node.attrs.path ?? '').trim();
	if (!rawPath) return;
	const candidates = resolveIncludePaths(baseDir(), rawPath, String(node.attrs.command ?? 'input'));
	const match = texFiles.current.find((f) => candidates.some((c) => samePath(f.path, c)));
	openFile(match ? match.path : candidates[0]);
}

export function includeDocCanvasView(baseDir: () => string): CanvasNodeViewConstructor {
	return (node, view) => {
		const { el, read, icon } = view.canvas.build;
		const path = String(node.attrs.path ?? '');
		const command = String(node.attrs.command ?? 'input');
		const missing = read(
			{ kind: 'store', name: 'drawnInputs' },
			() => liveRefProblems.current?.problems.find((p) => p.kind === 'file-missing' && p.what === 'input' && p.name === path.trim()) ?? null
		);
		const dom = el('div', 'includedoc-node-view');
		const chip = dom.appendChild(el('span', 'includedoc-chip'));
		setLook(chip, CHIP_LOOK);
		chip.states = { hover: { backgroundColor: 'color-mix(in srgb, var(--color-surface-500) 12%, transparent)' } };
		chip.hint = missing ? refProblemText(missing) : command === 'typst' ? `Open #include "${path}"` : `Open \\${command}{${path}}`;
		setLook(chip.appendChild(icon('file-symlink', 14)), ICON_LOOK);
		const code = chip.appendChild(el('span', 'includedoc-code'));
		const [open, close] = command === 'typst' ? ['#include "', '"'] : [`\\${command}{`, '}'];
		setLook(code.appendChild(el('span', 'includedoc-syntax', open)), SYNTAX_LOOK);
		const shown = code.appendChild(el('span', 'includedoc-path', path));
		setLook(shown, missing ? MISSING_LOOK : PATH_LOOK);
		if (!missing) shown.states = { hover: { textDecoration: 'underline' } };
		setLook(code.appendChild(el('span', 'includedoc-syntax', close)), SYNTAX_LOOK);
		let current = node;
		chip.on.click = () => {
			openInclude(current, baseDir);
			return true;
		};
		return {
			dom,
			update(next) {
				if (next.type !== current.type || next.attrs.path !== current.attrs.path || next.attrs.command !== current.attrs.command)
					return false;
				current = next;
				return true;
			}
		};
	};
}
