// what each set rule field is called in its panel
import { m } from '$lib/paraglide/messages';

export const SET_FIELD_LABELS: Record<string, () => string> = {
	paper: m.drawn_chip_typst_field_paper,
	margin: m.drawn_chip_typst_field_margin,
	columns: m.drawn_chip_typst_field_columns,
	numbering: m.drawn_chip_typst_field_numbering,
	font: m.drawn_chip_typst_field_font,
	size: m.drawn_chip_space_size,
	lang: m.drawn_chip_typst_field_lang,
	justify: m.drawn_chip_typst_field_justify,
	leading: m.drawn_chip_typst_field_leading,
	'first-line-indent': m.drawn_chip_typst_field_indent,
	title: m.drawn_chip_typst_field_title,
	author: m.drawn_chip_typst_field_author
};
