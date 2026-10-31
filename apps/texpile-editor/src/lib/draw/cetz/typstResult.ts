/** what Typst made of one document: its first page as SVG, unless it had errors, which keep the line they are on */
export type TypstResult = { svg: string | null; errors: string[]; errorLines: (number | null)[]; ms: number };
