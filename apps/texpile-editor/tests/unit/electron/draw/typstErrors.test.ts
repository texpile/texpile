import { describe, expect, it } from 'vitest';
import { typstErrors } from '../../../../../../electron/src/draw/typstErrors';

// as tinymist answers an export of a document that does not compile: Typst's report quoted as Rust prints a string
const REPLY =
	'crates/tinymist/src/task/export.rs:606:17: ExportTask(2): document is not available for export: ' +
	'"error: expected comma\\n  ┌─ /tmp/x/figure.typ:8:24\\n  │\\n8 │   rect((0, 0) (2, 1))\\n  │                         ^\\n\\n' +
	'error: unknown variable: foo\\n  ┌─ @preview/cetz:0.4.2/src/draw.typ:3:1\\n\\n"';

describe("tinymist's export error", () => {
	it("reads each error, with its line when it is in the figure's document", () => {
		expect(typstErrors(REPLY, '/tmp/x/figure.typ')).toEqual({
			errors: ['expected comma', 'unknown variable: foo'],
			errorLines: [8, null]
		});
	});
});
