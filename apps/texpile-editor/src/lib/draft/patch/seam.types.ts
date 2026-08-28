// One pruned run per column/page break, captured by the compile (page-extract.lua):
// glue entries carry width/stretch/shrink, k is a kern, p a penalty; x flags a node the
// capture could not represent. pen is the break's true \outputpenalty (the run's own
// break-penalty node reads 10000, neutralized by the engine before saving).
export type SeamRun = { w?: number; st?: number; sto?: number; sh?: number; sho?: number; k?: number; p?: number; x?: boolean };

export type SeamEntry = { page: number; col: number; pen: number; run: SeamRun[] };
