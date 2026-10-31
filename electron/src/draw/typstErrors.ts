// what Typst said about a figure that did not compile, from tinymist's export error: each `error: ...` line, then the
// `┌─ file:line:col` that places it
const ERROR = /(?:^\s*|: ")error: (.*)$/;
const PLACE = /┌─ (.*):(\d+):\d+\s*$/;

export function typstErrors(message: string, file: string): { errors: string[]; errorLines: (number | null)[] } {
	// tinymist quotes Typst's report as Rust prints a string: its newlines and quotes escaped
	const lines = message.replace(/\\n/g, '\n').replace(/\\"/g, '"').split('\n');
	const errors: string[] = [];
	const errorLines: (number | null)[] = [];
	lines.forEach((line, k) => {
		const error = ERROR.exec(line);
		if (!error) return;
		errors.push(error[1].trim());
		const place = lines.slice(k + 1, k + 3).map((l) => PLACE.exec(l)).find(Boolean);
		errorLines.push(place && place[1] === file ? Number(place[2]) : null);
	});
	return { errors, errorLines };
}
