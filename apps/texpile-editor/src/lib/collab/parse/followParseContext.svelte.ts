// the host publishes its parse context, a guest parses with the host's
import type { EditSession } from '../editSession';

export type ParseContextDeps = {
	session(): EditSession;
	guest(): boolean;
	/** signatures gathered from the main file, TeX and package files */
	macros(): string;
	/** guest: take the host's signatures */
	adoptMacros(macros: string): void;
};

export function followParseContext(deps: ParseContextDeps): void {
	$effect(() => {
		const session = deps.session();
		if (!session.active || deps.guest()) return;
		session.shareParseContext({ macros: deps.macros() });
	});
	$effect(() => {
		const session = deps.session();
		if (!session.active || !deps.guest()) return;
		deps.adoptMacros(session.parseContext?.macros ?? '');
	});
}
