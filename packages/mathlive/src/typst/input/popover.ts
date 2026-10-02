import type { _Mathfield } from '../../editor-mathfield/mathfield-private';
import {
  atomsToMarkup,
  escapeHtmlAttr,
  openSuggestionPopover,
} from '../../editor/suggestion-popover';
import { typstNameSample } from '../names';
import { readTypst } from '../read/read';

/** the names a typed prefix may become, each with what it draws; `pick` takes a click */
export function showTypstNames(
  mf: _Mathfield,
  names: readonly string[],
  current: number,
  pick: (name: string) => void
): void {
  let template = '';
  for (const [i, name] of names.entries()) {
    const markup = atomsToMarkup(mf, readTypst(typstNameSample(name)).atoms);
    template += `<li role="button" data-typst-name="${escapeHtmlAttr(name)}"${
      i === current ? ' class="ML__popover__current"' : ''
    }><span class="ML__popover__latex">${escapeHtmlAttr(name)}</span><span class="ML__popover__command">${markup}</span></li>`;
  }
  const panel = openSuggestionPopover(mf, `<ul>${template}</ul>`);
  panel.addEventListener('click', (ev) => {
    let el = ev.target as HTMLElement | null;
    while (el && !el.dataset.typstName) el = el.parentElement;
    if (el) pick(el.dataset.typstName!);
  });
}
