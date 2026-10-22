declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

// The three Node calls llms.ts makes; the docs don't install @types/node.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function writeFileSync(path: string, data: string): void
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
}
declare module 'node:path' {
  export function join(...parts: string[]): string
}
