/// <reference path="../../template/types/tiny.d.ts" />

// Both public surfaces must expose exactly string | null, not any/string.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type BackendRoot = Expect<Equal<TinyApp['paths']['resources'], string | null>>;
type FrontendRoot = Expect<Equal<Awaited<ReturnType<Tiny['app']['paths']>>['resources'], string | null>>;

declare const app: TinyApp;
if (app.paths.resources !== null) {
  const root: string = app.paths.resources;
}
async function frontend() {
  const paths = await tiny.app.paths();
  if (paths.resources !== null) {
    const root: string = paths.resources;
  }
}

// The Help menu role and the stock-items switch type-check.
const helpMenu: TinyMenu = { role: 'help', standard: false, items: [{ id: 'site', label: 'Website' }] };
