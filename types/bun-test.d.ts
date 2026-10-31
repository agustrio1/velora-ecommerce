/**
 * Minimal ambient module shims for the test suite.
 *
 * The workspace tsconfig sets `"types": []` so Bun/Node globals are intentionally
 * absent from application code (Workers + browser only). Tests opt into the Bun
 * runner and a Node crypto oracle without pulling those globals into the rest of
 * the program by declaring the two modules they import as loose (`any`) shapes.
 * At runtime `bun test` supplies the real `bun:test` and `node:crypto` bindings.
 */

declare module 'bun:test';
declare module 'node:crypto';
