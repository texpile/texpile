import { describe, expect, test } from 'vitest';
import { changeKind } from '$lib/editor/spellcheck/review/rewrite/changeTitles';
import { sentenceChanges, type RewriteChange } from '$lib/editor/spellcheck/review/rewrite/rewriteDiff';

// Haiku's real rewrites, one sentence per spell language plus Chinese and Japanese
const REWRITES: [string, string, string, [string, string, string][]][] = [
	[
		'en',
		'In this paper we proof that the operator $x$ are bounded, which it was conjectured since a long time.',
		'In this paper we prove that the operator $x$ is bounded, which was conjectured a long time ago.',
		[
			['proof', 'prove', 'form'],
			['are', 'is', 'word'],
			['it ', '', 'removeWord'],
			['since ', '', 'removeWord'],
			['time', 'time ago', 'addWord']
		]
	],
	[
		'en',
		'We would like to thank to the referee for many useful suggestions which helped us to improve considerably the paper.',
		'We would like to thank the referee for many useful suggestions, which helped us to improve the paper considerably.',
		[
			['to ', '', 'removeWord'],
			['suggestions', 'suggestions,', 'addComma'],
			['considerably the paper', 'the paper considerably', 'order']
		]
	],
	[
		'de',
		'Die Ergebnisse der Simulation zeigt, das der Fehler wie $x$ abnimmt wenn die Gitterweite gegen null geht.',
		'Die Ergebnisse der Simulation zeigen, dass der Fehler wie $x$ abnimmt, wenn die Gitterweite gegen null geht.',
		[
			['zeigt, das', 'zeigen, dass', 'word'],
			['abnimmt', 'abnimmt,', 'addComma']
		]
	],
	[
		'de',
		'In diesem Artikel wir zeigen, dass der Operator $x$ beschränkt sind, was seit langer Zeit vermutet wurde.',
		'In diesem Artikel zeigen wir, dass der Operator $x$ beschränkt ist, was seit langer Zeit vermutet wurde.',
		[
			['wir zeigen', 'zeigen wir', 'order'],
			['sind', 'ist', 'word']
		]
	],
	[
		'fr',
		"Les résultats de la simulation montre que l'erreur décroit comme $x$ quand le pas du maillage tend vers zero.",
		"Les résultats de la simulation montrent que l'erreur décroît comme $x$ lorsque le pas du maillage tend vers zéro.",
		[
			['montre', 'montrent', 'form'],
			['décroit', 'décroît', 'form'],
			['quand', 'lorsque', 'word'],
			['zero', 'zéro', 'word']
		]
	],
	[
		'es',
		'En este artículo nosotros demostramos que el operador $x$ son acotado, lo cual fue conjeturado desde hace mucho tiempo.',
		'En este artículo demostramos que el operador $x$ es acotado, lo cual se conjeturó desde hace mucho tiempo.',
		[
			['nosotros ', '', 'removeWord'],
			['son', 'es', 'word'],
			['fue conjeturado', 'se conjeturó', 'word']
		]
	],
	[
		'it',
		'Ringraziamo il revisore per i suoi molti suggerimenti utile.',
		'Ringraziamo il revisore per i suoi molti suggerimenti utili.',
		[['utile', 'utili', 'form']]
	],
	[
		'nl',
		'In dit artikel wij bewijzen dat de operator $x$ begrensd zijn, wat al lang werd vermoed.',
		'In dit artikel bewijzen wij dat de operator $x$ begrensd is, wat al lang werd vermoed.',
		[
			['wij bewijzen', 'bewijzen wij', 'order'],
			['zijn', 'is', 'word']
		]
	],
	[
		'pt-BR',
		'Neste artigo nós provamos que o operador $x$ são limitado, o que foi conjecturado a muito tempo.',
		'Neste artigo, nós provamos que o operador $x$ é limitado, o que foi conjecturado há muito tempo.',
		[
			['artigo', 'artigo,', 'addComma'],
			['são', 'é', 'word'],
			['a', 'há', 'word']
		]
	],
	[
		'pt-PT',
		'Os resultados da simulação mostra que o erro decresce como $x$ quando o tamanho da malha tende para zero.',
		'Os resultados da simulação mostram que o erro decresce como $x$ quando o tamanho da malha tende para zero.',
		[['mostra', 'mostram', 'form']]
	],
	[
		'pl',
		'W tym artykule my udowadniamy, że operator $x$ są ograniczony, co było przypuszczane od dawna.',
		'W tym artykule dowodzimy, że operator $x$ jest ograniczony, co od dawna było przypuszczane.',
		[
			['my udowadniamy', 'dowodzimy', 'word'],
			['są', 'jest', 'word'],
			['było przypuszczane od dawna', 'od dawna było przypuszczane', 'order']
		]
	],
	[
		'zh',
		'模拟的结果表明误差随着网格尺寸趋于零而像$x$一样的减小，这和第$x$节中发展的理论是一至的。',
		'模拟的结果表明，误差随着网格尺寸趋于零而像$x$一样减小，这与第$x$节中发展的理论是一致的。',
		[
			['表明', '表明，', 'addComma'],
			['的', '', 'removeWord'],
			['和', '与', 'word'],
			['一至', '一致', 'word']
		]
	],
	['en', 'By a long sequence of a-priori estimates.', 'By a long sequence of a priori estimates.', [['a-', 'a ', 'punctuation']]],
	[
		'ja',
		'本論文では、作用素$x$が有界であるを証明する。',
		'本論文では、作用素$x$が有界であることを証明する。',
		[['ある', 'あること', 'addWord']]
	]
];

function applied(source: string, changes: RewriteChange[]): string {
	return [...changes].reverse().reduce((s, c) => s.slice(0, c.from) + c.replacement + s.slice(c.to), source);
}

describe('sentenceChanges', () => {
	test.each(REWRITES)('%s: %s', (language, source, rewritten, expected) => {
		const changes = sentenceChanges(source, rewritten, language);
		const quoted = changes.map((c) => {
			const quote = source.slice(c.from, c.to);
			return [quote, c.replacement, changeKind(quote, c.replacement, c.whole)];
		});
		expect(quoted).toEqual(expected);
		expect(applied(source, changes)).toBe(rewritten);
	});

	test('a sentence mostly rewritten is one rephrasing', () => {
		const source = 'Wir danken den Gutachter für seine viele hilfreiche Vorschläge.';
		const rewritten = 'Wir danken den Gutachtern für ihre vielen hilfreichen Vorschläge.';
		expect(sentenceChanges(source, rewritten, 'de')).toEqual([{ from: 0, to: source.length, replacement: rewritten, whole: true }]);
	});

	test('a change to a formula is left out and the rest is kept', () => {
		const source = 'The norm $x$ are small and the bound hold.';
		expect(sentenceChanges(source, 'The norm $x$ is small and the bound holds.', 'en').map((c) => c.replacement)).toEqual(['is', 'holds']);
		expect(sentenceChanges(source, 'The norms are small and the bound holds.', 'en')).toEqual([]);
	});
});
