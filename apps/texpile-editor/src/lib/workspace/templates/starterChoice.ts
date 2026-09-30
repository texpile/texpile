import type { Starter } from '$lib/workspace/starters';
import type { UniverseTemplate, UserTemplate } from './templateBridge.types';

/** what the starter picker hands back: a bundled starter, a template the user saved, or one from Typst Universe */
export type StarterChoice =
	{ kind: 'bundled'; starter: Starter } | { kind: 'saved'; template: UserTemplate } | { kind: 'universe'; template: UniverseTemplate };
