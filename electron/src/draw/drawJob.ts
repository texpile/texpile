// the document a warm lualatex draws figures in: the paper's preamble once, then one picture per request
import path from 'node:path';

// pdfTeX's names a figure written for pdfLaTeX may use, where LuaTeX has none
const PDFTEX_NAMES =
	'\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi\n' +
	'\\ifdefined\\pdfstrcmp\\else\\RequirePackage{pdftexcmds}\\makeatletter\\let\\pdfstrcmp\\pdf@strcmp\\makeatother\\fi\n';

// pgf's driver as tikzcap.lua reads it, the statement marks and the picture's box
function capture(luaDir: string): string {
	const lua = (name: string) => path.join(luaDir, name).replace(/\\/g, '/');
	return (
		'\\makeatletter\n' +
		`\\directlua{dofile("${lua('tikzcap.lua')}") dofile("${lua('draw-loop.lua')}")}\n` +
		'\\def\\tc@transform#1#2{\\pgfgettransformentries\\tc@a\\tc@b\\tc@c\\tc@d\\tc@e\\tc@f\n' +
		'  \\directlua{tikzcap_mark(#1,#2,"\\tc@a","\\tc@b","\\tc@c","\\tc@d","\\tc@e","\\tc@f",\n' +
		'    "\\the\\pgf@xx","\\the\\pgf@xy","\\the\\pgf@yx","\\the\\pgf@yy")}}\n' +
		'\\def\\tikzcapmark#1{\\tc@transform{#1}{true}}\n' +
		'\\def\\webtexpicture#1{\\directlua{tikzcap_begin()}%\n' +
		'  \\begingroup\\setbox0\\hbox{\\input{#1}\\unskip}\\directlua{tikzcap_finish()}\\endgroup}\n' +
		'\\def\\pgfsys@invoke#1{\\directlua{tikzcap_lit("\\luaescapestring{#1}")}}\n' +
		'\\ifdefined\\tikzset\\tikzset{tikzcap transform/.code={\\tc@transform{#1}{false}}}\\fi\n' +
		'\\def\\tc@shadingspec#1#2{{\\pgf@parsefunc{#2}\\directlua{tikzcap_pending("#1",' +
		'"\\luaescapestring{\\pgf@pdfparseddomain}","\\luaescapestring{\\pgf@pdfparsedfunction}")}}}\n' +
		'\\let\\tc@hori\\pgfsys@horishading\\let\\tc@vert\\pgfsys@vertshading\\let\\tc@radial\\pgfsys@radialshading\n' +
		'\\def\\pgfsys@horishading#1#2#3{\\tc@shadingspec{h}{#3}\\tc@hori{#1}{#2}{#3}' +
		'\\directlua{tikzcap_shading(\\the\\lastsavedboxresourceindex)}}\n' +
		'\\def\\pgfsys@vertshading#1#2#3{\\tc@shadingspec{v}{#3}\\tc@vert{#1}{#2}{#3}' +
		'\\directlua{tikzcap_shading(\\the\\lastsavedboxresourceindex)}}\n' +
		'\\def\\pgfsys@radialshading#1#2#3{\\tc@shadingspec{r}{#3}' +
		'{\\pgf@process{#2}\\directlua{tikzcap_focus("\\pgf@sys@tonumber\\pgf@x","\\pgf@sys@tonumber\\pgf@y")}}' +
		'\\tc@radial{#1}{#2}{#3}\\directlua{tikzcap_shading(\\the\\lastsavedboxresourceindex)}}\n' +
		'\\def\\pgfsys@transparencygroupfrombox#1{\\setbox#1=\\hbox{\\directlua{tikzcap_group(1)}\\box#1\\directlua{tikzcap_group(0)}}}\n' +
		['png', 'jpg', 'pdf']
			.map(
				(t) =>
					`\\ifdefined\\Ginclude@${t}\\let\\tc@incl@${t}\\Ginclude@${t}` +
					`\\def\\Ginclude@${t}#1{\\directlua{tikzcap_imagefile("\\luaescapestring{#1}")}\\tc@incl@${t}{#1}}\\fi\n`
			)
			.join('') +
		'\\makeatother\n'
	);
}

// standalone makes every tikzpicture a page of its own, which cannot live in the capture box
const PAGE_ONLY = /^(tikz|pstricks|border|varwidth|crop|preview|multi|convert|class|beamer|float)\b/;

function withoutStandalone(preamble: string): string {
	return preamble.replace(/\\documentclass\s*(?:\[([^\]]*)\])?\s*\{standalone\}/, (_, options: string | undefined) => {
		const all = (options ?? '')
			.split(',')
			.map((o) => o.trim())
			.filter(Boolean);
		const kept = all.filter((o) => !PAGE_ONLY.test(o));
		const tikz = all.includes('tikz') ? '\n\\usepackage{tikz}' : '';
		return `\\documentclass${kept.length ? `[${kept.join(',')}]` : ''}{article}${tikz}`;
	});
}

/** the preamble a picture is drawn under: a class always, and nothing from `\begin{document}` on */
export function preambleHead(preamble: string): string {
	const own = withoutStandalone(preamble);
	const head = /\\documentclass/.test(own) ? own : `\\documentclass{article}\n${own}`;
	return head.replace(/\\begin\{document\}[\s\S]*$/, '');
}

export function drawJob(preamble: string, luaDir: string): string {
	return (
		PDFTEX_NAMES +
		preambleHead(preamble) +
		'\n\\nofiles\n\\begin{document}\n' +
		capture(luaDir) +
		'\\newcount\\drawrun \\drawrun=1\n' +
		'\\loop\\directlua{draw_step()}\\ifnum\\drawrun>0 \\repeat\n' +
		// a shading is a PDF object, and a PDF with objects and no page ends in an error: one empty page
		'\\csname tex_shipout:D\\endcsname\\hbox{}\n' +
		'\\end{document}\n'
	);
}
