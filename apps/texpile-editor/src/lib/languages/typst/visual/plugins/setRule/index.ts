import { readSetRule, SET_TARGETS, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { setRuleFace } from './setRuleFace';
import TypstSetRuleSettings from './TypstSetRuleSettings.svelte';
import { setRuleDocument } from './document';

export const setRule: TypstPlugin = {
	functions: SET_TARGETS,
	face({ source }) {
		const rule = readSetRule(source);
		return rule ? setRuleFace(rule, source) : null;
	},
	settings: (source) => (readSetRule(source) ? TypstSetRuleSettings : null),
	document: setRuleDocument
};
