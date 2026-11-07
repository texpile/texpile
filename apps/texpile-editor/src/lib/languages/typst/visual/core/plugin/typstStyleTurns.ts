// a style replaces the function around a paragraph that stands alone in it, as the style list shows one at a time
import type { Command } from 'prosemirror-state';
import { renameLoneEnvironment, unwrapLoneEnvironment } from '$lib/editor/visual/insert/loneEnvironmentTurns';

/** another function's name, with the arguments that belonged to the old one dropped */
export function renameEnvironment(name: string): Command {
	return renameLoneEnvironment('typ_env', (env) => ({ ...env.attrs, name, args: null, typBodyArg: null }));
}

export const unwrapEnvironment: Command = unwrapLoneEnvironment('typ_env');
