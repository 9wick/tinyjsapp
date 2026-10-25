/// <reference path="../../template/types/tiny.d.ts" />

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type SameDialogs = Expect<Equal<TinyApp['dialog'], Tiny['dialog']>>;
type ConfirmResult = Expect<Equal<ReturnType<TinyApp['dialog']['confirm']>, Promise<boolean>>>;
type AlertResult = Expect<Equal<ReturnType<TinyApp['dialog']['alert']>, Promise<true>>>;
type SaveResult = Expect<Equal<ReturnType<TinyApp['dialog']['saveFile']>, Promise<string | null>>>;
type OpenFilesResult = Expect<Equal<ReturnType<TinyApp['dialog']['openFiles']>, Promise<string[] | null>>>;

declare const app: TinyApp;
app.dialog.confirm('Continue?', 'Details');
app.dialog.saveFile({ types: ['json'], name: 'report.json' });
app.dialog.prompt('Name', { default: '' });
// @ts-expect-error prompt has no string shorthand
app.dialog.prompt('Name', 'default');
// @ts-expect-error file types are an array of extensions
app.dialog.openFile({ types: 'json' });
