// keeps a session's parse context: the host publishes its own, a guest parses with the host's
import { snippetStatus, useSessionCallLooks } from '$lib/editor/snippets/file/snippetStatus.svelte';
import type { EditSession } from '../editSession';
import type { CallLooks } from './parseContext';

export type ParseContextDeps = {
	session(): EditSession;
	guest(): boolean;
	/** the signatures this side gathered from its main file, TeX and package files */
	macros(): string;
	/** a guest's signatures, the host's */
	adoptMacros(macros: string): void;
};

const NO_LOOKS: CallLooks = { latex: new Map(), typst: new Map() };

export function followParseContext(deps: ParseContextDeps): void {
	$effect(() => {
		const session = deps.session();
		if (!session.active || deps.guest()) return;
		session.shareParseContext({ macros: deps.macros(), looks: snippetStatus.looks });
	});
	$effect(() => {
		const session = deps.session();
		if (!session.active || !deps.guest()) return;
		const context = session.parseContext;
		useSessionCallLooks(context?.looks ?? NO_LOOKS);
		deps.adoptMacros(context?.macros ?? '');
	});
	$effect(() => {
		if (!deps.guest() || !deps.session().active) return;
		return () => useSessionCallLooks(null);
	});
}
