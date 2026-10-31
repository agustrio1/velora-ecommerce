/**
 * Ambient declarations for React Router framework virtual modules.
 * These are provided by `@react-router/dev` at build time and only need a type
 * shim so `tsc` can resolve them.
 */
declare module 'virtual:react-router/server-build' {
  import type { ServerBuild } from 'react-router';
  const build: ServerBuild;
  export default build;
}

declare module 'virtual:react-router/browser-manifest' {
  import type { AssetsManifest } from 'react-router';
  const manifest: AssetsManifest;
  export default manifest;
}
