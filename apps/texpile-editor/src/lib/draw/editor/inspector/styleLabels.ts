import { m } from '$lib/paraglide/messages';

const WIDTHS: Record<string, () => string> = {
	thin: () => m.figure_width_thin(),
	semithick: () => m.figure_width_semithick(),
	thick: () => m.figure_width_thick(),
	'very thick': () => m.figure_width_very_thick()
};

const DASHES: Record<string, () => string> = {
	solid: () => m.figure_dash_solid(),
	dashed: () => m.figure_dash_dashed(),
	dotted: () => m.figure_dash_dotted()
};

const COLORS: Record<string, () => string> = {
	black: () => m.figure_color_black(),
	gray: () => m.figure_color_gray(),
	red: () => m.figure_color_red(),
	orange: () => m.figure_color_orange(),
	green: () => m.figure_color_green(),
	teal: () => m.figure_color_teal(),
	blue: () => m.figure_color_blue(),
	violet: () => m.figure_color_violet(),
	purple: () => m.figure_color_purple(),
	brown: () => m.figure_color_brown(),
	maroon: () => m.figure_color_maroon()
};

export function widthLabel(value: string) {
	return WIDTHS[value]?.() ?? value;
}
export function dashLabel(value: string) {
	return DASHES[value]?.() ?? value;
}
export function colorLabel(value: string) {
	return COLORS[value]?.() ?? value;
}
