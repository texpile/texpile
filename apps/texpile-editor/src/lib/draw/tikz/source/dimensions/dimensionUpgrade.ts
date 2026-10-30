import { listPictures, readPicture } from '../picture';
import { dimensionStatement, keepingStyle, readDimension, withDimensionStyle } from './dimensionStatements';

/** a picture's lengths as this version writes them: on the paper whatever its scale, a node's across the box around it */
function upgradePicture(source: string, pictureIndex: number) {
	const picture = readPicture(source, pictureIndex);
	if (!picture) return source;
	let text = source;
	let measured = false;
	// last first, so the statements before stay where they were read
	for (const st of [...picture.statements].reverse()) {
		const d = readDimension(source, picture, st);
		if (!d) continue;
		measured = true;
		// an angle or a radius is written as it always was
		if (d.kind === 'angle' || d.kind === 'radius') continue;
		const now = dimensionStatement(source, pictureIndex, d);
		if (now?.source === source) text = text.slice(0, st.from) + keepingStyle(source, st, now.text) + text.slice(st.to);
	}
	return measured ? withDimensionStyle(text, pictureIndex) : text;
}

/** the dimensions an earlier version of the editor wrote, written again as this one writes them */
export function upgradeDimensions(source: string) {
	return listPictures(source).reduce((text, _, k) => upgradePicture(text, k), source);
}
