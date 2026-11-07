import type { TypstPlugin } from '$lib/languages/typst/visual/core';
import { bodyFace } from './bodyFace';

export const packageBlock: TypstPlugin = {
	role: (use) => use.form === 'call' && use.origin === 'package' && use.entry?.kind === 'function' && use.entry.block === true,
	face: (core) => bodyFace(core.source, core)
};
