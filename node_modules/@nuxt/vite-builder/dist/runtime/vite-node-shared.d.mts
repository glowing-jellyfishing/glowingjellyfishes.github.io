/** @typedef {import('node:net').Socket} Socket */
/** @typedef {import('../vite-node').ViteNodeFetch} ViteNodeFetch */
/** @type {import('../vite-node').ViteNodeServerOptions} */
export const viteNodeOptions: import("../vite-node").ViteNodeServerOptions;
/**
 * @type {ViteNodeFetch}
 */
export const viteNodeFetch: ViteNodeFetch;
export type Socket = import("node:net").Socket;
export type ViteNodeFetch = import("../vite-node").ViteNodeFetch;
