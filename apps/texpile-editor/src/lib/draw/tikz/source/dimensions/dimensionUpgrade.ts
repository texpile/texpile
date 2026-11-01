import { listPictures, readPicture } from '../picture';
import { dimensionStatement, keepingStyle, readDimension, withDimensionStyle } from './dimensionStatements';

/** a picture's lengths as this version writes them: on the paper whatever its scale, a node's across the box around it */
function upgradePicture(source: string, pictureIndex: number) {
	const picture = readPicture(source, pictureIndex);
	if (!picture) return source;
	let text = source;
	let measured = false;
	for (const st of [...picture.statements].reverse()) {
		const d = readDimension(source, picture, st);
		if (!d) continue;
		measured = true;
		if (d.kind === 'angle' || d.kind === 'radius') continue;
		const now = dimensionStatement(source, pictureIndex, d);
		if (now?.source === source) text = text.slice(0, st.from) + keepingStyle(source, st, now.text) + text.slice(st.to);
	}
	return measured ? withDimensionStyle(text, pictureIndex) : text;
}

export function upgradeDimensions(source: string) {
	return listPictures(source).reduce((text, _, k) => upgradePicture(text, k), source);
}
