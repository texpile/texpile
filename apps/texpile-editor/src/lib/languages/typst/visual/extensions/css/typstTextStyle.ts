// what a `#text(..)` call's arguments look like: its size, color, weight and style as inline CSS
import { namedArg, positionalArgs, readTypstCall } from '../../core/reading/typstCall';
import { typstColorCss } from './typstColor';
import { typstLengthCss } from './typstLengthCss';

const WEIGHTS: Record<string, string> = {
	thin: '100',
	extralight: '200',
	light: '300',
	regular: '400',
	medium: '500',
	semibold: '600',
	bold: '700',
	extrabold: '800',
	black: '900'
};

export function typstTextStyle(args: string): string {
	const call = readTypstCall(`#text(${args})`);
	if (!call) return '';
	const declarations: string[] = [];
	const [first] = positionalArgs(call);
	const size = namedArg(call, 'size') ?? first ?? null;
	const sizeCss = size ? typstLengthCss(size.node, call.source) : null;
	if (sizeCss) declarations.push(`font-size: ${sizeCss}`);
	const fill = namedArg(call, 'fill');
	const fillCss = fill ? typstColorCss(fill.node, call.source) : null;
	if (fillCss) declarations.push(`color: ${fillCss}`);
	const weight = namedArg(call, 'weight');
	const weightCss = weight ? (weight.kind === 'Int' ? weight.value : WEIGHTS[weight.value.slice(1, -1)]) : null;
	if (weightCss) declarations.push(`font-weight: ${weightCss}`);
	const style = namedArg(call, 'style');
	if (style && /^"(italic|oblique)"$/.test(style.value)) declarations.push('font-style: italic');
	return declarations.join('; ');
}

export function cssDeclarations(css: string): Record<string, string> {
	return Object.fromEntries(
		css
			.split(';')
			.map((declaration) => declaration.split(':').map((part) => part.trim()))
			.filter(([property, value]) => property && value)
	);
}

export function typstTextDeclarations(args: string): Record<string, string> {
	return cssDeclarations(typstTextStyle(args));
}
