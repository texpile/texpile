// the kernel's input conventions, split into the ones that print a letter or mark and the tie, which prints a space
import { LIGATURES } from './knowledge/commands/commandFacts';

export const TIE = LIGATURES.find((l) => l.prints.trim() === '')!;

export const TEXT_LIGATURES = LIGATURES.filter((l) => l !== TIE);
