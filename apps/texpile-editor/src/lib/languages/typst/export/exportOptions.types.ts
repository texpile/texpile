export type TypstExportFormat = 'pdf' | 'png' | 'svg' | 'html';

/** every PDF standard tinymist 0.15 takes (tinymist-world's PdfStandard), less ua-1, which is its own switch */
export type PdfStandardChoice =
	| ''
	| '1.4'
	| '1.5'
	| '1.6'
	| '1.7'
	| '2.0'
	| 'a-1b'
	| 'a-1a'
	| 'a-2b'
	| 'a-2u'
	| 'a-2a'
	| 'a-3b'
	| 'a-3u'
	| 'a-3a'
	| 'a-4'
	| 'a-4f'
	| 'a-4e';

/** what the dialog edits; the parts that do not apply to the chosen format are kept, not cleared */
export type TypstExportOptions = {
	format: TypstExportFormat;
	/** '' for every page, otherwise Typst's page ranges: `1-3, 5, 8-` */
	pages: string;
	/** '' leaves the choice to Typst, which writes PDF 1.7 */
	pdfStandard: PdfStandardChoice;
	/** also conform to PDF/UA-1, the accessibility standard */
	pdfUa: boolean;
	/** write the structure tree screen readers use; some standards need it and turn it on themselves */
	pdfTagged: boolean;
	ppi: number;
	/** all pages as one image, stacked, instead of one file per page */
	merge: boolean;
	/** '' leaves what the pages do not cover transparent, otherwise a #rrggbb fill behind them */
	fill: string;
};

/** what the folder remembers between exports: the options, less the page range, plus where the last one went */
export type TypstExportMemory = Omit<TypstExportOptions, 'pages'> & { lastDir?: string };

export type ExportProblem = 'pages' | 'ppi' | 'fill' | 'ua-version';
