import { describe, expect, it } from 'vitest';
import { inputOf, settingsIn } from '$lib/draw/host/engine/bodySettings';
import { takeFragmentNeeds, withLibrary } from '$lib/draw/tikz/source/options/libraries';

const MAIN = [
	'\\documentclass{article}',
	'\\usepackage{tikz}',
	'\\begin{document}',
	'\\definecolor{brand}{HTML}{3366CC}',
	'\\tikzset{box/.style={draw, fill=brand!20}}',
	'{\\tikzset{local/.style={red}}}',
	'\\input{figures/flow.tikz}',
	'\\usetikzlibrary{arrows.meta}',
	'\\end{document}'
].join('\n');

describe('the body settings a picture is drawn under', () => {
	it('reads the settings before a place, outside groups', () => {
		expect(settingsIn(MAIN, MAIN.indexOf('\\definecolor'), MAIN.indexOf('\\input'))).toEqual([
			'\\definecolor{brand}{HTML}{3366CC}',
			'\\tikzset{box/.style={draw, fill=brand!20}}'
		]);
	});

	it('finds where the main file inputs a fragment, with or without its extension', () => {
		expect(inputOf(MAIN, 'figures/flow.tikz')).toBe(MAIN.indexOf('\\input'));
		expect(inputOf(MAIN, 'figures/other.tikz')).toBe(MAIN.length);
	});
});

describe("a fragment's needs", () => {
	it('are kept for the text the edit made, and taken once', () => {
		const fragment = '\\begin{tikzpicture}\\node[diamond] {};\\end{tikzpicture}';
		withLibrary(fragment, 'shapes.geometric');
		expect(takeFragmentNeeds(fragment)).toEqual({ packages: [], libraries: ['shapes.geometric'] });
		expect(takeFragmentNeeds(fragment)).toBeNull();
	});
});
