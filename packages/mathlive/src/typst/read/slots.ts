import type { Atom } from '../../core/atom-class';
import { PlaceholderAtom } from '../../atoms/placeholder';

// typst source has no empty slot, so an inserted `#?` is read as a private-use character
const SLOT = '\uf8ff';

export function markTypstSlots(src: string): string {
  return src.split('#?').join(SLOT);
}

/** the marked characters as empty slots, as `#?` is in inserted LaTeX */
export function placeTypstSlots(atoms: readonly Atom[]): Atom[] {
  return atoms.map((atom) => {
    for (const slot of atom.children.filter((x) => x.value === SLOT)) {
      slot.parent!.addChildBefore(placeholderFor(slot), slot);
      slot.parent!.removeChild(slot);
    }
    return atom.value === SLOT ? placeholderFor(atom) : atom;
  });
}

function placeholderFor(slot: Atom): Atom {
  const placeholder = new PlaceholderAtom({ style: slot.style });
  placeholder.typstLead = slot.typstLead;
  return placeholder;
}
