// what jsdom lacks and a live field touches
export function stubBrowser(): void {
  window.getComputedStyle = (() => ({ getPropertyValue: () => '' })) as never;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  Object.assign(document, { fonts: { ready: Promise.resolve() } });
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as never;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scroll = () => {};
}
