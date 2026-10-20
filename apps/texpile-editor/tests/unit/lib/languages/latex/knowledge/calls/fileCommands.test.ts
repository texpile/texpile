import { describe, expect, it } from 'vitest';
import { dirOf, fileCallsIn, namesTried } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';

const named = (text: string, roles?: Parameters<typeof fileCallsIn>[1]) =>
	fileCallsIn(text, roles).flatMap((call) =>
		call.args.flatMap((a) => a.values.map((v) => [call.command, v.value, text.slice(v.at, v.at + v.value.length)]))
	);

describe('file calls in source text', () => {
	it('reads each file argument by the kinds of the arguments before it', () => {
		const text =
			'\\usepackage[opt]{amsmath, graphicx}\n\\includegraphics*[width=1cm]{fig}\\bibliography{a,b}\n\\graphicspath{{img/}{pics/}}';
		expect(named(text)).toEqual([
			['usepackage', 'amsmath', 'amsmath'],
			['usepackage', 'graphicx', 'graphicx'],
			['includegraphics', 'fig', 'fig'],
			['bibliography', 'a', 'a'],
			['bibliography', 'b', 'b'],
			['graphicspath', 'img/', 'img/'],
			['graphicspath', 'pics/', 'pics/']
		]);
	});

	it('reads TeX’s own \\input name, skips a line break before the word, and keeps the folder of \\subimport', () => {
		expect(named('\\input chap1 more \\\\input{no}', ['file'])).toEqual([['input', 'chap1', 'chap1']]);
		const [call] = fileCallsIn('\\subimport{parts/}{intro}', ['file']);
		const file = call.args.find((a) => a.arg.role === 'file')!;
		expect([dirOf(call, file), file.values[0].value, file.arg.from]).toEqual(['parts/', 'intro', 'file']);
	});
});

describe('the names TeX looks for', () => {
	it('puts the extension on when the command always adds it, or when the name has none', () => {
		const arg = (name: string, i: number) => commonCommand(name)!.args[i];
		expect(namesTried(arg('input', 0), 'ch')).toEqual(['ch.tex', 'ch']);
		expect(namesTried(arg('include', 0), 'ch')).toEqual(['ch.tex']);
		expect(namesTried(arg('bibliography', 1), 'refs')).toEqual(['refs.bib']);
		expect(namesTried(arg('addbibresource', 1), 'refs.bib')).toEqual(['refs.bib']);
	});
});
