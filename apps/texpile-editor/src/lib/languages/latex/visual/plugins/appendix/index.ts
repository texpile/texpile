import { dividerFace, type LatexPlugin } from '$lib/languages/latex/visual/core';
import AppendixSettings from './AppendixSettings.svelte';

const APPENDIX = /^\s*\\appendix\s*$/;

export const appendix: LatexPlugin = {
	commands: ['appendix'],
	face: (part, core) => (part.kind === 'command' ? dividerFace('Appendix', core.source) : undefined),
	settings: (source) => (APPENDIX.test(source) ? AppendixSettings : null)
};
