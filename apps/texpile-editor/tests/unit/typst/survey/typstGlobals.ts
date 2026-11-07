// the names Typst's standard library puts in scope (0.14), so a name the paper and its packages do not bind reads as Typst's
// only when it is one
export const TYPST_GLOBALS = new Set(
	`bibliography cite document emph enum figure footnote heading link list numbering outline par parbreak quote ref strong
	table terms title highlight linebreak lorem lower overline raw smallcaps smartquote strike sub super text underline upper
	math align block box colbreak columns grid h hide layout measure move pad page pagebreak place repeat rotate scale skew
	stack v circle color curve ellipse gradient image line path pattern tiling polygon rect square stroke luma rgb cmyk oklab
	oklch linear-rgb hsl hsv counter here locate metadata query state position csv json read toml xml yaml cbor arguments
	array assert auto bool bytes calc content datetime decimal dictionary duration eval float function int label module none
	panic plugin regex repr selector str symbol sys type version range sym emoji pdf html black gray silver white navy blue
	aqua teal eastern purple fuchsia maroon red orange yellow olive green lime top bottom left right center horizon start end
	ltr rtl true false context`.split(/\s+/)
);
