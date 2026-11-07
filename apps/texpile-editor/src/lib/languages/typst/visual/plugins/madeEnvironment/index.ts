import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { madeFace } from './madeFace';

export const madeEnvironment: TypstPlugin = {
	role: (use) => use.form === 'call' && use.origin === 'package' && use.entry?.kind === 'value',
	face: (core) => madeFace(core.source, core)
};
