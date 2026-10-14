/// <reference path="../../template/types/tiny.d.ts" />

// Both public surfaces must expose exactly string | null, like resources.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type BackendExe = Expect<Equal<TinyApp['paths']['executables'], string | null>>;
type FrontendExe = Expect<Equal<Awaited<ReturnType<Tiny['app']['paths']>>['executables'], string | null>>;
