// typst named colors that CSS can also render: the mark's DOM styling uses the value directly.
// `eastern` exists in typst but not CSS, so it stays a chip
export const TYPST_CSS_COLORS: ReadonlySet<string> = new Set([
	'black',
	'gray',
	'silver',
	'white',
	'navy',
	'blue',
	'aqua',
	'teal',
	'purple',
	'fuchsia',
	'maroon',
	'red',
	'orange',
	'yellow',
	'olive',
	'green',
	'lime'
]);
