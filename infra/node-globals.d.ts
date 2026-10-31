/**
 * Ambient types for the build-time scripts under infra/ (seed generator, bootstrap).
 *
 * The repository tsconfig intentionally declares `types: []` so that no Node-only
 * API can leak into the Worker or the browser bundle. These scripts run with Bun on
 * the developer's machine, so they get a deliberately narrow declaration of exactly
 * what they use — nothing more.
 */

declare module 'node:fs' {
  export function mkdirSync(path: string, options?: { recursive?: boolean; mode?: number }): void;
  export function writeFileSync(path: string, data: string | Uint8Array, encoding?: string): void;
  export function readFileSync(path: string, encoding?: string): string;
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
}

declare module 'node:child_process' {
  export interface SpawnResult {
    status: number | null;
    signal?: string | null;
    stdout?: string | Uint8Array;
    stderr?: string | Uint8Array;
  }
  export function spawnSync(
    command: string,
    args?: string[],
    options?: { stdio?: 'inherit' | 'pipe' | 'ignore' | null; encoding?: string; cwd?: string },
  ): SpawnResult;
}

interface ImportMeta {
  /** Bun-specific: directory of the current module. */
  readonly dir: string;
  readonly url: string;
  readonly file: string;
}

declare const process: {
  cwd(): string;
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};
