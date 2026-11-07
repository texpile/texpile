import { Sigma, SquareRadical } from '@lucide/svelte';
import { computeMathAttrs, numberedEquationAttrs, type LatexInsertContext, type LatexInsertOffer } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

function environmentOffer(name: string, hint: string | undefined): LatexInsertOffer {
	// a space in the body: the math field cannot take the caret in an empty environment
	const content = `\\begin{${name}}\n \n\\end{${name}}`;
	const bare = name === 'equation';
	return {
		id: `math:${name}`,
		label: name,
		icon: Sigma,
		category: 'math',
		hint,
		shape: 'block',
		style: false,
		select: 'node',
		make: (s) =>
			bare
				? s.nodes.block_math.create(numberedEquationAttrs(), s.text(' '))
				: s.nodes.block_math.create(computeMathAttrs(content), s.text(content))
	};
}

// the math field has no flalign, so the caret typed into one writes outside the environment
const NOT_IN_MATH_FIELD = new Set(['flalign', 'flalign*']);

export function mathInserts(ctx: LatexInsertContext): LatexInsertOffer[] {
	const math = ctx.environments().filter((e) => e.in === 'math' || e.body?.startsWith('math'));
	// one that needs an argument (xalignat's column pairs) has nowhere in the math editor to ask for it
	const displays = math.filter(
		(e) =>
			e.body === 'math-display' &&
			!NOT_IN_MATH_FIELD.has(e.name) &&
			!(e.args ?? []).some((a) => /^[mr]/.test(a.kind)) &&
			!(e.name.endsWith('*') && ctx.environment(e.name.slice(0, -1)))
	);
	const covers = math.map((e) => e.name);
	return [
		{
			id: 'displaymath',
			label: m.blockmenu_math_block(),
			icon: SquareRadical,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.block_math.create({}, s.text(' ')),
			covers
		},
		...displays.filter((e) => e.name !== 'displaymath').map((e) => ({ ...environmentOffer(e.name, ctx.hint(e)), covers }))
	];
}
