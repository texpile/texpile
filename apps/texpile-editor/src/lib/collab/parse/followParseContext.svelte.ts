// the host publishes its parse context, a guest parses with the host's
import type { EditSession } from '../editSession';
import { box } from '$lib/runes/box.svelte';
import type { Engine } from '$lib/workspace/compileCommand';

/** a guest's: the host's compile engine; undefined outside a session as a guest */
export const hostEngine = box<Engine | null | undefined>(undefined);

export type ParseContextDeps = {
	session(): EditSession;
	guest(): boolean;
	/** signatures gathered from the main file and package files */
	macros(): string;
	engine(): Engine | null;
	/** guest: take the host's signatures */
	adoptMacros(macros: string): void;
};

export function followParseContext(deps: ParseContextDeps): void {
	$effect(() => {
		const session = deps.session();
		if (!session.active || deps.guest()) return;
		session.shareParseContext({ macros: deps.macros(), engine: deps.engine() });
	});
	$effect(() => {
		const session = deps.session();
		if (!session.active || !deps.guest()) return;
		deps.adoptMacros(session.parseContext?.macros ?? '');
		hostEngine.current = session.parseContext?.engine ?? null;
		return () => (hostEngine.current = undefined);
	});
}
