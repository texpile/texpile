// a chip that is code without its hash (an argument of a call the editor draws, lifted out of a code block) as the
// statement it is
import { isCodeChip } from '../../../syntax/codeChip';

export function hashedCode(source: string): string {
	return isCodeChip(source) ? `#${source.trimStart()}` : source;
}
