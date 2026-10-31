/** the event the paper sends for a picture double-clicked; the workspace opens its figure tab */
export const OPEN_FIGURE = 'texpileopenfigure';

/** the picture's place among the paper's pictures and its text as the paper has it */
export type OpenFigureDetail = { index: number; source: string };

/** a figure tab asks to be closed, or shown from the source editor's mark */
export const CLOSE_FIGURE = 'texpileclosefigure';
export const SHOW_FIGURE = 'texpileshowfigure';

export type FigureDetail = { figure: string };

/** a figure tab asks for its picture's line in a source editor */
export const SHOW_FIGURE_SOURCE = 'texpileshowfiguresource';

export type FigureSourceDetail = { figure: string; line: number };
