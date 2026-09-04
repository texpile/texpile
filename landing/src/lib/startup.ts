// Start-up measurements for the editor pages. Launch to the main window, warm start, median of
// five runs, one Windows 11 laptop (Ryzen AI 9 HX 370), 2026-09-04. Each editor opened the same
// scratch .tex file (VS Code 1.135, TeXstudio 4.9.6, Texpile 1.0.0-rc.4). A page shows the
// editors that compete with it for the format; versions stay out of the chart by Louis's choice.
export type Startup = { name: string; ms: number; note: boolean; own: boolean };

export const STARTUP: Startup[] = [
	{ name: 'VS Code', ms: 373, note: true, own: false },
	{ name: 'TeXstudio', ms: 1087, note: false, own: false },
	{ name: 'Texpile', ms: 236, note: false, own: true }
];
