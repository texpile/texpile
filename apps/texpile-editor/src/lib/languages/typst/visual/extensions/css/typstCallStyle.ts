// what a styling element's call (`#strike[..]`, `#smallcaps[..]`) does to its text, as inline CSS
const STYLES: Record<string, string> = {
	strike: 'text-decoration: line-through',
	overline: 'text-decoration: overline',
	underline: 'text-decoration: underline',
	smallcaps: 'font-variant: small-caps',
	upper: 'text-transform: uppercase',
	lower: 'text-transform: lowercase',
	super: 'vertical-align: super; font-size: smaller',
	sub: 'vertical-align: sub; font-size: smaller',
	emph: 'font-style: italic',
	strong: 'font-weight: bold',
	// the same yellow as the plain highlight mark: a fill it names may be one CSS has no name for
	highlight: 'background-color: yellow; padding: 0 2px'
};

export function typstCallStyle(name: string): string {
	return Object.hasOwn(STYLES, name) ? STYLES[name] : '';
}
