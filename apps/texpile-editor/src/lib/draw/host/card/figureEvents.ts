export const OPEN_FIGURE = 'texpileopenfigure';

export type OpenFigureDetail = { index: number; source: string };

export const OPEN_FIGURE_AT = 'texpileopenfigureat';

export type OpenFigureAtDetail = { path: string; from: number };

export const CLOSE_FIGURE = 'texpileclosefigure';
export const SHOW_FIGURE = 'texpileshowfigure';

export type FigureDetail = { figure: string };

export const SHOW_FIGURE_SOURCE = 'texpileshowfiguresource';

export type FigureSourceDetail = { figure: string; line: number };
