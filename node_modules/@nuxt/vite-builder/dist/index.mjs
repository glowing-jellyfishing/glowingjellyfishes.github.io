import fs, { existsSync, readFileSync } from 'node:fs';
import * as vite from 'vite';
import { isCSSRequest, createLogger } from 'vite';
import { dirname, normalize, resolve, join, relative, basename } from 'pathe';
import { useNitro, logger, useNuxt, resolvePath, createIsIgnored, addVitePlugin } from '@nuxt/kit';
import replace from '@rollup/plugin-replace';
import { findStaticImports, sanitizeFilePath } from 'mlly';
import { parseURL, parseQuery, joinURL, getQuery, withLeadingSlash, withTrailingSlash, withoutLeadingSlash, withoutBase } from 'ufo';
import { filename as filename$1 } from 'pathe/utils';
import { resolveTSConfig } from 'pkg-types';
import { resolveModulePath } from 'exsolve';
import vuePlugin from '@vitejs/plugin-vue';
import viteJsxPlugin from '@vitejs/plugin-vue-jsx';
import { getPort } from 'get-port-please';
import defu$1, { defu } from 'defu';
import { defineEnv } from 'unenv';
import { createError, defineEventHandler, handleCors, setHeader } from 'h3';
import { pathToFileURL, fileURLToPath } from 'node:url';
import MagicString from 'magic-string';
import { unlink, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import { Buffer } from 'node:buffer';
import { normalizeViteManifest } from 'vue-bundle-renderer';
import { provider, hasTTY, isCI } from 'std-env';
import { colorize } from 'consola/utils';
import escapeRE from 'escape-string-regexp';
import { isBuiltin } from 'node:module';
import { createJiti } from 'jiti';
import { genImport, genObjectFromRawEntries } from 'knitwork';

function isVue(id, opts = {}) {
  const { search } = parseURL(decodeURIComponent(pathToFileURL(id).href));
  if (id.endsWith(".vue") && !search) {
    return true;
  }
  if (!search) {
    return false;
  }
  const query = parseQuery(search);
  if (query.nuxt_component) {
    return false;
  }
  if (query.macro && (search === "?macro=true" || !opts.type || opts.type.includes("script"))) {
    return true;
  }
  const type = "setup" in query ? "script" : query.type;
  if (!("vue" in query) || opts.type && !opts.type.includes(type)) {
    return false;
  }
  return true;
}

const IS_CSS_RE = /\.(?:css|scss|sass|postcss|pcss|less|stylus|styl)(?:\?[^.]+)?$/;
function isCSS(file) {
  return IS_CSS_RE.test(file);
}

function DevStyleSSRPlugin(options) {
  return {
    name: "nuxt:dev-style-ssr",
    apply: "serve",
    enforce: "post",
    applyToEnvironment: (environment) => environment.name === "client",
    transform(code, id) {
      if (!isCSS(id) || !code.includes("import.meta.hot")) {
        return;
      }
      let moduleId = id;
      if (moduleId.startsWith(options.srcDir)) {
        moduleId = moduleId.slice(options.srcDir.length);
      }
      const selectors = [joinURL(options.buildAssetsURL, moduleId), joinURL(options.buildAssetsURL, "@fs", moduleId)];
      return code + selectors.map((selector) => `
document.querySelectorAll(\`link[href="${selector}"]\`).forEach(i=>i.remove())`).join("");
    }
  };
}

const VITE_ASSET_RE = /__VITE_ASSET__|__VITE_PUBLIC_ASSET__/;
function RuntimePathsPlugin() {
  let sourcemap;
  return {
    name: "nuxt:runtime-paths-dep",
    enforce: "post",
    applyToEnvironment: (environment) => environment.name === "client",
    configResolved(config) {
      sourcemap = !!config.build.sourcemap;
    },
    transform(code, id) {
      const { pathname, search } = parseURL(decodeURIComponent(pathToFileURL(id).href));
      if (isCSS(pathname)) {
        return;
      }
      if (pathname.endsWith(".vue")) {
        if (search && parseQuery(search).type === "style") {
          return;
        }
      }
      if (VITE_ASSET_RE.test(code)) {
        const s = new MagicString(code);
        s.prepend('import "#internal/nuxt/paths";');
        return {
          code: s.toString(),
          map: sourcemap ? s.generateMap({ hires: true }) : void 0
        };
      }
    }
  };
}

function resolveClientEntry(config) {
  const input = config.environments.client?.build.rollupOptions.input ?? config.build.rollupOptions.input;
  if (input) {
    if (typeof input === "string") {
      return input;
    }
    if (!Array.isArray(input) && input.entry) {
      return input.entry;
    }
  }
  throw new Error("No entry found in rollupOptions.input");
}
function resolveServerEntry(config) {
  const input = config.environments.ssr?.build.rollupOptions.input ?? config.build.rollupOptions.input;
  if (input) {
    if (typeof input === "string") {
      return input;
    }
    if (!Array.isArray(input) && input.server) {
      return input.server;
    }
  }
  throw new Error("No entry found in rollupOptions.input");
}

const QUERY_RE$1 = /\?.+$/;
function TypeCheckPlugin(nuxt) {
  let entry;
  let sourcemap;
  return {
    name: "nuxt:type-check",
    applyToEnvironment: (environment) => environment.name === "client" && !environment.config.isProduction,
    apply: () => {
      return !nuxt.options.test && nuxt.options.typescript.typeCheck === true;
    },
    configResolved(config) {
      try {
        entry = resolveClientEntry(config);
        sourcemap = !!config.build.sourcemap;
      } catch {
        console.debug("[nuxt:type-check] Could not resolve client entry, type checking will not be applied.");
      }
    },
    transform(code, id) {
      if (id.replace(QUERY_RE$1, "") !== entry) {
        return;
      }
      const s = new MagicString(code);
      s.prepend('import "/@vite-plugin-checker-runtime-entry";\n');
      return {
        code: s.toString(),
        map: sourcemap ? s.generateMap({ hires: true }) : void 0
      };
    }
  };
}

const QUERY_RE = /\?.+$/;
function ModulePreloadPolyfillPlugin() {
  let isDisabled = false;
  let entry;
  let sourcemap;
  return {
    name: "nuxt:module-preload-polyfill",
    applyToEnvironment: (environment) => environment.name === "client",
    configResolved(config) {
      try {
        isDisabled = config.build.modulePreload === false || config.build.modulePreload.polyfill === false;
        sourcemap = !!config.build.sourcemap;
        entry = resolveClientEntry(config);
      } catch {
        console.debug("[nuxt:module-preload-polyfill] Could not resolve client entry, module preload polyfill will not be injected.");
      }
    },
    transform(code, id) {
      if (isDisabled || id.replace(QUERY_RE, "") !== entry) {
        return;
      }
      const s = new MagicString(code);
      s.prepend('import "vite/modulepreload-polyfill";\n');
      return {
        code: s.toString(),
        map: sourcemap ? s.generateMap({ hires: true }) : void 0
      };
    }
  };
}

let _distDir = dirname(fileURLToPath(import.meta.url));
if (_distDir.match(/(chunks|shared)$/)) {
  _distDir = dirname(_distDir);
}
const distDir = _distDir;

function getManifest(nuxt, ssrServer, clientEntry) {
  const css = /* @__PURE__ */ new Set();
  for (const key of ssrServer.moduleGraph.urlToModuleMap.keys()) {
    if (isCSS(key)) {
      const query = getQuery(key);
      if ("raw" in query) {
        continue;
      }
      const importers = ssrServer.moduleGraph.urlToModuleMap.get(key)?.importers;
      if (importers && [...importers].every((i) => i.id && "raw" in getQuery(i.id))) {
        continue;
      }
      css.add(key);
    }
  }
  const manifest = normalizeViteManifest({
    "@vite/client": {
      file: "@vite/client",
      css: [...css],
      module: true,
      isEntry: true
    },
    ...nuxt.options.features.noScripts === "all" ? {} : {
      [clientEntry]: {
        file: clientEntry,
        isEntry: true,
        module: true,
        resourceType: "script"
      }
    }
  });
  return manifest;
}
function generateSocketPath() {
  const uniqueSuffix = `${process.pid}-${Date.now()}`;
  const socketName = `nuxt-vite-node-${uniqueSuffix}`;
  if (process.platform === "win32") {
    return join(String.raw`\\.\pipe`, socketName);
  }
  if (process.platform === "linux") {
    const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
    if (nodeMajor >= 20 && provider !== "stackblitz") {
      let isDocker = false;
      try {
        isDocker = fs.existsSync("/.dockerenv") || fs.existsSync("/proc/1/cgroup") && fs.readFileSync("/proc/1/cgroup", "utf8").includes("docker");
      } catch {
      }
      if (!isDocker) {
        return `\0${socketName}.sock`;
      }
    }
  }
  return join(os.tmpdir(), `${socketName}.sock`);
}
function useInvalidates() {
  const invalidates = /* @__PURE__ */ new Set();
  function markInvalidate(mod) {
    if (!mod.id) {
      return;
    }
    if (invalidates.has(mod.id)) {
      return;
    }
    invalidates.add(mod.id);
    markInvalidates(mod.importers);
  }
  function markInvalidates(mods) {
    if (!mods) {
      return;
    }
    for (const mod of mods) {
      markInvalidate(mod);
    }
  }
  return {
    invalidates,
    markInvalidate,
    markInvalidates
  };
}
function ViteNodePlugin(nuxt) {
  let socketServer;
  const socketPath = generateSocketPath();
  let viteNodeServerOptions;
  const { invalidates, markInvalidate, markInvalidates } = useInvalidates();
  const cleanupSocket = async () => {
    if (socketServer && socketServer.listening) {
      await new Promise((resolveClose) => socketServer.close(() => resolveClose()));
    }
    if (socketPath && !socketPath.startsWith("\\\\.\\pipe\\")) {
      try {
        await unlink(socketPath);
      } catch {
      }
    }
  };
  return {
    name: "nuxt:vite-node-server",
    enforce: "post",
    applyToEnvironment: (environment) => environment.name === "client",
    configureServer(clientServer) {
      nuxt.hook("vite:serverCreated", (ssrServer, ctx) => {
        if (!ctx.isServer) {
          return;
        }
        viteNodeServerOptions = {
          socketPath,
          root: nuxt.options.srcDir,
          entryPath: resolveServerEntry(ssrServer.config),
          base: ssrServer.config.base || "/_nuxt/",
          // TODO: remove baseURL in future
          baseURL: nuxt.options.devServer.url
        };
        process.env.NUXT_VITE_NODE_OPTIONS = JSON.stringify(viteNodeServerOptions);
        socketServer = createViteNodeSocketServer(nuxt, ssrServer, clientServer, invalidates, viteNodeServerOptions);
      });
      nuxt.hook("close", cleanupSocket);
      nuxt.hook("app:templatesGenerated", (_app, changedTemplates) => {
        for (const template of changedTemplates) {
          const mods = clientServer.moduleGraph.getModulesByFile(`virtual:nuxt:${encodeURIComponent(template.dst)}`);
          for (const mod of mods || []) {
            markInvalidate(mod);
          }
        }
      });
      clientServer.watcher.on("all", (_event, file) => {
        invalidates.add(file);
        markInvalidates(clientServer.moduleGraph.getModulesByFile(normalize(file)));
      });
    },
    async buildEnd() {
      if (socketServer && socketServer.listening) {
        await new Promise((resolveClose) => socketServer.close(() => resolveClose()));
      }
      if (socketPath && !socketPath.startsWith("\\\\.\\pipe\\")) {
        try {
          await unlink(socketPath);
        } catch {
        }
      }
    }
  };
}
function createViteNodeSocketServer(nuxt, ssrServer, clientServer, invalidates, config) {
  const server = net.createServer((socket) => {
    const INITIAL_BUFFER_SIZE = 64 * 1024;
    const MAX_BUFFER_SIZE = 1024 * 1024 * 1024;
    let buffer = Buffer.alloc(INITIAL_BUFFER_SIZE);
    let writeOffset = 0;
    let readOffset = 0;
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 0);
    const processMessage = async (request) => {
      const { id: requestId, type, payload } = request;
      try {
        switch (type) {
          case "manifest": {
            const manifestData = getManifest(nuxt, ssrServer, resolveClientEntry(clientServer.config));
            sendResponse(socket, requestId, manifestData);
            return;
          }
          case "invalidates": {
            const responsePayload = Array.from(invalidates);
            invalidates.clear();
            sendResponse(socket, requestId, responsePayload);
            return;
          }
          case "resolve": {
            const { id: resolveId, importer } = payload;
            if (!resolveId || !ssrServer) {
              throw createError({ statusCode: 400, message: "Missing id for resolve" });
            }
            const resolvedResult = await ssrServer.pluginContainer.resolveId(resolveId, importer).catch(() => null);
            sendResponse(socket, requestId, resolvedResult);
            return;
          }
          case "module": {
            if (payload.moduleId === "/" || !ssrServer) {
              throw createError({ statusCode: 400, message: "Invalid moduleId" });
            }
            const response = await ssrServer.environments.ssr.fetchModule(payload.moduleId).catch(async (err) => {
              const errorData = {
                code: "VITE_ERROR",
                id: payload.moduleId,
                stack: err.stack || "",
                message: err.message || ""
              };
              if (err.frame) {
                errorData.frame = err.frame;
              }
              if (!errorData.frame && err.code === "PARSE_ERROR") {
                try {
                  errorData.frame = await clientServer.transformRequest(payload.moduleId).then((res) => `${err.message || ""}
${res?.code}`).catch(() => void 0);
                } catch {
                }
              }
              throw createError({ data: errorData, message: err.message || "Error fetching module" });
            });
            sendResponse(socket, requestId, response);
            return;
          }
          default:
            throw createError({ statusCode: 400, message: `Unknown request type: ${type}` });
        }
      } catch (error) {
        sendError(socket, requestId, error);
      }
    };
    const resetBuffer = () => {
      writeOffset = 0;
      readOffset = 0;
    };
    const compactBuffer = () => {
      if (readOffset > 0) {
        const remainingData = writeOffset - readOffset;
        if (remainingData > 0) {
          buffer.copy(buffer, 0, readOffset, writeOffset);
        }
        writeOffset = remainingData;
        readOffset = 0;
      }
    };
    const ensureBufferCapacity = (additionalBytes) => {
      const requiredSize = writeOffset + additionalBytes;
      if (requiredSize > MAX_BUFFER_SIZE) {
        throw new Error(`Buffer size limit exceeded: ${requiredSize} > ${MAX_BUFFER_SIZE}`);
      }
      if (requiredSize > buffer.length) {
        compactBuffer();
        if (writeOffset + additionalBytes > buffer.length) {
          const newSize = Math.min(
            Math.max(buffer.length * 2, requiredSize),
            MAX_BUFFER_SIZE
          );
          const newBuffer = Buffer.alloc(newSize);
          buffer.copy(newBuffer, 0, 0, writeOffset);
          buffer = newBuffer;
        }
      }
    };
    socket.on("data", (data) => {
      try {
        ensureBufferCapacity(data.length);
        data.copy(buffer, writeOffset);
        writeOffset += data.length;
        while (writeOffset - readOffset >= 4) {
          const messageLength = buffer.readUInt32BE(readOffset);
          const totalLength = 4 + messageLength;
          if (writeOffset - readOffset < totalLength) {
            break;
          }
          const messageJSON = buffer.subarray(readOffset + 4, readOffset + totalLength).toString("utf-8");
          readOffset += totalLength;
          try {
            const request = JSON.parse(messageJSON);
            processMessage(request).catch((error) => {
              sendError(socket, request?.id || "unknown", error);
            });
          } catch (parseError) {
            const errorMessage = parseError instanceof Error ? parseError.message : "Unknown parse error";
            socket.destroy(new Error(`Invalid JSON in message: ${errorMessage}`));
            return;
          }
        }
        if (readOffset > buffer.length / 2) {
          compactBuffer();
        }
      } catch (error) {
        socket.destroy(error instanceof Error ? error : new Error("Buffer management error"));
      }
    });
    socket.on("error", () => {
      resetBuffer();
    });
    socket.on("close", () => {
      resetBuffer();
    });
  });
  const currentSocketPath = config.socketPath;
  if (!currentSocketPath) {
    throw new Error("Socket path not configured for ViteNodeSocketServer.");
  }
  if (!currentSocketPath.startsWith("\\\\.\\pipe\\")) {
    try {
      fs.unlinkSync(currentSocketPath);
    } catch (unlinkError) {
      if (unlinkError.code !== "ENOENT") ;
    }
  }
  server.listen(currentSocketPath);
  server.on("error", () => {
  });
  return server;
}
function sendResponse(socket, id, data) {
  try {
    const response = { id, type: "response", data };
    const responseJSON = JSON.stringify(response);
    const messageBuffer = Buffer.from(responseJSON, "utf-8");
    const messageLength = messageBuffer.length;
    const fullMessage = Buffer.alloc(4 + messageLength);
    fullMessage.writeUInt32BE(messageLength, 0);
    messageBuffer.copy(fullMessage, 4);
    socket.write(fullMessage, (err) => {
      if (err) {
      }
    });
  } catch (error) {
    sendError(socket, id, error);
  }
}
function sendError(socket, id, error) {
  const errorResponse = {
    id,
    type: "error",
    error: {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      statusMessage: error.statusMessage,
      data: error.data
    }
  };
  const responseJSON = JSON.stringify(errorResponse);
  const messageBuffer = Buffer.from(responseJSON, "utf-8");
  const messageLength = messageBuffer.length;
  const fullMessage = Buffer.alloc(4 + messageLength);
  fullMessage.writeUInt32BE(messageLength, 0);
  messageBuffer.copy(fullMessage, 4);
  socket.write(fullMessage, (err) => {
  });
}
async function writeDevServer(nuxt) {
  const serverResolvedPath = resolve(distDir, "runtime/vite-node.mjs");
  const manifestResolvedPath = resolve(distDir, "runtime/client.manifest.mjs");
  await mkdir(join(nuxt.options.buildDir, "dist/server"), { recursive: true });
  await Promise.all([
    writeFile(
      resolve(nuxt.options.buildDir, "dist/server/server.mjs"),
      `export { default } from ${JSON.stringify(pathToFileURL(serverResolvedPath).href)}`
    ),
    writeFile(
      resolve(nuxt.options.buildDir, "dist/server/client.manifest.mjs"),
      `export { default } from ${JSON.stringify(pathToFileURL(manifestResolvedPath).href)}`
    )
  ]);
}

const PREFIX = "virtual:public?";
const CSS_URL_RE = /url\((\/[^)]+)\)/g;
const CSS_URL_SINGLE_RE = /url\(\/[^)]+\)/;
const RENDER_CHUNK_RE = /(?<= = )['"`]/;
const PublicDirsPlugin = (options) => {
  const { resolveFromPublicAssets } = useResolveFromPublicAssets();
  let sourcemap;
  return [
    {
      name: "nuxt:vite-public-dir-resolution-dev",
      apply() {
        return !!options.dev && !!options.baseURL && options.baseURL !== "/";
      },
      transform(code, id) {
        if (!isCSSRequest(id) || !CSS_URL_SINGLE_RE.test(code)) {
          return;
        }
        const s = new MagicString(code);
        for (const [full, url] of code.matchAll(CSS_URL_RE)) {
          if (url && resolveFromPublicAssets(url)) {
            s.replace(full, `url(${options.baseURL}${url})`);
          }
        }
        if (s.hasChanged()) {
          return {
            code: s.toString(),
            map: sourcemap ? s.generateMap({ hires: true }) : void 0
          };
        }
      }
    },
    {
      name: "nuxt:vite-public-dir-resolution",
      configResolved(config) {
        sourcemap = !!config.build.sourcemap;
      },
      load: {
        order: "pre",
        handler(id) {
          if (id.startsWith(PREFIX)) {
            return `import { publicAssetsURL } from '#internal/nuxt/paths';export default publicAssetsURL(${JSON.stringify(decodeURIComponent(id.slice(PREFIX.length)))})`;
          }
        }
      },
      resolveId: {
        order: "post",
        handler(id) {
          if (id === "/__skip_vite" || id[0] !== "/" || id.startsWith("/@fs")) {
            return;
          }
          if (resolveFromPublicAssets(id)) {
            return PREFIX + encodeURIComponent(id);
          }
        }
      },
      renderChunk(code, chunk) {
        if (!chunk.facadeModuleId?.includes("?inline&used")) {
          return;
        }
        const s = new MagicString(code);
        const q = code.match(RENDER_CHUNK_RE)?.[0] || '"';
        for (const [full, url] of code.matchAll(CSS_URL_RE)) {
          if (url && resolveFromPublicAssets(url)) {
            s.replace(full, `url(${q} + publicAssetsURL(${q}${url}${q}) + ${q})`);
          }
        }
        if (s.hasChanged()) {
          s.prepend(`import { publicAssetsURL } from '#internal/nuxt/paths';`);
          return {
            code: s.toString(),
            map: sourcemap ? s.generateMap({ hires: true }) : void 0
          };
        }
      },
      generateBundle(_outputOptions, bundle) {
        for (const [file, chunk] of Object.entries(bundle)) {
          if (!file.endsWith(".css") || chunk.type !== "asset") {
            continue;
          }
          let css = chunk.source.toString();
          let wasReplaced = false;
          for (const [full, url] of css.matchAll(CSS_URL_RE)) {
            if (url && resolveFromPublicAssets(url)) {
              const relativeURL = relative(withLeadingSlash(dirname(file)), url);
              css = css.replace(full, `url(${relativeURL})`);
              wasReplaced = true;
            }
          }
          if (wasReplaced) {
            chunk.source = css;
          }
        }
      }
    }
  ];
};
const PUBLIC_ASSETS_RE = /[?#].*$/;
function useResolveFromPublicAssets() {
  const nitro = useNitro();
  function resolveFromPublicAssets(id) {
    for (const dir of nitro.options.publicAssets) {
      if (!id.startsWith(withTrailingSlash(dir.baseURL || "/"))) {
        continue;
      }
      const path = id.replace(PUBLIC_ASSETS_RE, "").replace(withTrailingSlash(dir.baseURL || "/"), withTrailingSlash(dir.dir));
      if (existsSync(path)) {
        return id;
      }
    }
  }
  return { resolveFromPublicAssets };
}

let duplicateCount = 0;
let lastType = null;
let lastMsg = null;
const logLevelMap = {
  silent: "silent",
  info: "info",
  verbose: "info"
};
const logLevelMapReverse = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3
};
const RUNTIME_RESOLVE_REF_RE = /^([^ ]+) referenced in/m;
function createViteLogger(config, ctx = {}) {
  const loggedErrors = /* @__PURE__ */ new WeakSet();
  const canClearScreen = hasTTY && !isCI && config.clearScreen;
  const _logger = createLogger();
  const relativeOutDir = relative(config.root, config.build.outDir || "");
  const clear = () => {
    _logger.clearScreen(
      // @ts-expect-error silent is a log level but not a valid option for clearScreens
      "silent"
    );
  };
  const clearScreen = canClearScreen ? clear : () => {
  };
  const { resolveFromPublicAssets } = useResolveFromPublicAssets();
  function output(type, msg, options = {}) {
    if (typeof msg === "string" && !process.env.DEBUG) {
      if (msg.startsWith("Sourcemap") && msg.includes("node_modules")) {
        return;
      }
      if (msg.includes("didn't resolve at build time, it will remain unchanged to be resolved at runtime")) {
        const id = msg.trim().match(RUNTIME_RESOLVE_REF_RE)?.[1];
        if (id && resolveFromPublicAssets(id)) {
          return;
        }
      }
      if (type === "info" && ctx.hideOutput && msg.includes(relativeOutDir)) {
        return;
      }
    }
    const sameAsLast = lastType === type && lastMsg === msg;
    if (sameAsLast) {
      duplicateCount += 1;
      clearScreen();
    } else {
      duplicateCount = 0;
      lastType = type;
      lastMsg = msg;
      if (options.clear) {
        clearScreen();
      }
    }
    if (options.error) {
      loggedErrors.add(options.error);
    }
    const prevLevel = logger.level;
    logger.level = logLevelMapReverse[config.logLevel || "info"];
    logger[type](msg + (sameAsLast ? colorize("dim", ` (x${duplicateCount + 1})`) : ""));
    logger.level = prevLevel;
  }
  const warnedMessages = /* @__PURE__ */ new Set();
  const viteLogger = {
    hasWarned: false,
    info(msg, opts) {
      output("info", msg, opts);
    },
    warn(msg, opts) {
      viteLogger.hasWarned = true;
      output("warn", msg, opts);
    },
    warnOnce(msg, opts) {
      if (warnedMessages.has(msg)) {
        return;
      }
      viteLogger.hasWarned = true;
      output("warn", msg, opts);
      warnedMessages.add(msg);
    },
    error(msg, opts) {
      viteLogger.hasWarned = true;
      output("error", msg, opts);
    },
    clearScreen() {
      clear();
    },
    hasErrorLogged(error) {
      return loggedErrors.has(error);
    }
  };
  return viteLogger;
}

async function buildClient(nuxt, ctx) {
  const nodeCompat = nuxt.options.experimental.clientNodeCompat ? {
    alias: defineEnv({ nodeCompat: true, resolve: true }).env.alias,
    define: { global: "globalThis" }
  } : { alias: {}, define: {} };
  const clientConfig = vite.mergeConfig(ctx.config, vite.mergeConfig({
    configFile: false,
    base: nuxt.options.dev ? joinURL(nuxt.options.app.baseURL.replace(/^\.\//, "/") || "/", nuxt.options.app.buildAssetsDir) : "./",
    css: {
      devSourcemap: !!nuxt.options.sourcemap.client
    },
    define: {
      "process.env.NODE_ENV": JSON.stringify(ctx.config.mode),
      "process.server": false,
      "process.client": true,
      "process.browser": true,
      "process.nitro": false,
      "process.prerender": false,
      "import.meta.server": false,
      "import.meta.client": true,
      "import.meta.browser": true,
      "import.meta.nitro": false,
      "import.meta.prerender": false,
      "module.hot": false,
      ...nodeCompat.define
    },
    optimizeDeps: {
      entries: [ctx.entry],
      include: [],
      // We exclude Vue and Nuxt common dependencies from optimization
      // as they already ship ESM.
      //
      // This will help to reduce the chance for users to encounter
      // common chunk conflicts that causing browser reloads.
      // We should also encourage module authors to add their deps to
      // `exclude` if they ships bundled ESM.
      //
      // Also since `exclude` is inert, it's safe to always include
      // all possible deps even if they are not used yet.
      //
      // @see https://github.com/antfu/nuxt-better-optimize-deps#how-it-works
      exclude: [
        // Vue
        "vue",
        "@vue/runtime-core",
        "@vue/runtime-dom",
        "@vue/reactivity",
        "@vue/shared",
        "@vue/devtools-api",
        "vue-router",
        "vue-demi",
        // Nuxt
        "nuxt",
        "nuxt/app",
        // Nuxt Deps
        "@unhead/vue",
        "consola",
        "defu",
        "devalue",
        "h3",
        "hookable",
        "klona",
        "ofetch",
        "pathe",
        "ufo",
        "unctx",
        "unenv",
        // these will never be imported on the client
        "#app-manifest"
      ]
    },
    resolve: {
      alias: {
        // user aliases
        ...nodeCompat.alias,
        ...ctx.config.resolve?.alias,
        "nitro/runtime": join(nuxt.options.buildDir, "nitro.client.mjs"),
        // TODO: remove in v5
        "#internal/nitro": join(ctx.nuxt.options.buildDir, "nitro.client.mjs"),
        "nitropack/runtime": join(ctx.nuxt.options.buildDir, "nitro.client.mjs"),
        // work around vite optimizer bug
        "#app-manifest": resolveModulePath("mocked-exports/empty", { from: import.meta.url })
      }
    },
    cacheDir: resolve(nuxt.options.rootDir, ctx.config.cacheDir ?? "node_modules/.cache/vite", "client"),
    build: {
      sourcemap: nuxt.options.sourcemap.client ? ctx.config.build?.sourcemap ?? nuxt.options.sourcemap.client : false,
      manifest: "manifest.json",
      outDir: resolve(nuxt.options.buildDir, "dist/client"),
      rollupOptions: {
        input: { entry: ctx.entry }
      }
    },
    plugins: [
      DevStyleSSRPlugin({
        srcDir: nuxt.options.srcDir,
        buildAssetsURL: joinURL(nuxt.options.app.baseURL, nuxt.options.app.buildAssetsDir)
      }),
      RuntimePathsPlugin(),
      ViteNodePlugin(nuxt),
      // Type checking client panel
      TypeCheckPlugin(nuxt),
      ModulePreloadPolyfillPlugin()
    ],
    appType: "custom",
    server: {
      warmup: {
        clientFiles: [ctx.entry]
      },
      middlewareMode: true
    }
  }, nuxt.options.vite.$client || {}));
  clientConfig.customLogger = createViteLogger(clientConfig);
  if (!nuxt.options.dev) {
    clientConfig.server.hmr = false;
  }
  const useViteCors = clientConfig.server?.cors !== void 0;
  if (!useViteCors) {
    clientConfig.server.cors = false;
  }
  const fileNames = withoutLeadingSlash(join(nuxt.options.app.buildAssetsDir, "[hash].js"));
  clientConfig.build.rollupOptions = defu(clientConfig.build.rollupOptions, {
    output: {
      chunkFileNames: nuxt.options.dev ? void 0 : fileNames,
      entryFileNames: nuxt.options.dev ? "entry.js" : fileNames
    }
  });
  if (clientConfig.server && clientConfig.server.hmr !== false) {
    const serverDefaults = {
      hmr: {
        protocol: nuxt.options.devServer.https ? "wss" : void 0
      }
    };
    if (typeof clientConfig.server.hmr !== "object" || !clientConfig.server.hmr.server) {
      const hmrPortDefault = 24678;
      serverDefaults.hmr.port = await getPort({
        port: hmrPortDefault,
        ports: Array.from({ length: 20 }, (_, i) => hmrPortDefault + 1 + i)
      });
    }
    if (nuxt.options.devServer.https) {
      serverDefaults.https = nuxt.options.devServer.https === true ? {} : nuxt.options.devServer.https;
    }
    clientConfig.server = defu(clientConfig.server, serverDefaults);
  }
  if (!nuxt.options.test && nuxt.options.build.analyze && (nuxt.options.build.analyze === true || nuxt.options.build.analyze.enabled)) {
    clientConfig.plugins.push(...await import('./chunks/analyze.mjs').then((r) => r.AnalyzePlugin(nuxt)));
  }
  await nuxt.callHook("vite:extendConfig", clientConfig, { isClient: true, isServer: false });
  clientConfig.plugins.unshift(
    vuePlugin(clientConfig.vue),
    viteJsxPlugin(clientConfig.vueJsx)
  );
  await nuxt.callHook("vite:configResolved", clientConfig, { isClient: true, isServer: false });
  const exclude = new Set(clientConfig.optimizeDeps.exclude);
  clientConfig.optimizeDeps.include = clientConfig.optimizeDeps.include.filter((dep) => !exclude.has(dep));
  if (nuxt.options.dev) {
    const viteServer = await vite.createServer(clientConfig);
    ctx.clientServer = viteServer;
    nuxt.hook("close", () => viteServer.close());
    await nuxt.callHook("vite:serverCreated", viteServer, { isClient: true, isServer: false });
    const transformHandler = viteServer.middlewares.stack.findIndex((m) => m.handle instanceof Function && m.handle.name === "viteTransformMiddleware");
    viteServer.middlewares.stack.splice(transformHandler, 0, {
      route: "",
      handle: (req, res, next) => {
        if (req._skip_transform) {
          req.url = joinURL("/__skip_vite", req.url.replace(/\?.*/, ""));
        }
        next();
      }
    });
    const staticBases = [];
    for (const folder of useNitro().options.publicAssets) {
      if (folder.baseURL && folder.baseURL !== "/" && folder.baseURL.startsWith(nuxt.options.app.buildAssetsDir)) {
        staticBases.push(folder.baseURL.replace(/\/?$/, "/"));
      }
    }
    const devHandlerRegexes = [];
    for (const handler of nuxt.options.devServerHandlers) {
      if (handler.route && handler.route !== "/" && handler.route.startsWith(nuxt.options.app.buildAssetsDir)) {
        devHandlerRegexes.push(new RegExp(
          `^${handler.route.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:[^/]+/g, "[^/]+").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")}$`
          // single wildcard (*) to match any segment
        ));
      }
    }
    const viteMiddleware = defineEventHandler(async (event) => {
      const viteRoutes = [];
      for (const viteRoute of viteServer.middlewares.stack) {
        const m = viteRoute.route;
        if (m.length > 1) {
          viteRoutes.push(m);
        }
      }
      if (!event.path.startsWith(clientConfig.base) && !viteRoutes.some((route) => event.path.startsWith(route))) {
        event.node.req._skip_transform = true;
      } else if (!useViteCors) {
        const isPreflight = handleCors(event, nuxt.options.devServer.cors);
        if (isPreflight) {
          return null;
        }
        setHeader(event, "Vary", "Origin");
      }
      const _originalPath = event.node.req.url;
      await new Promise((resolve2, reject) => {
        viteServer.middlewares.handle(event.node.req, event.node.res, (err) => {
          event.node.req.url = _originalPath;
          return err ? reject(err) : resolve2(null);
        });
      });
      if (!event.handled && event.path.startsWith(nuxt.options.app.buildAssetsDir) && !staticBases.some((baseURL) => event.path.startsWith(baseURL)) && !devHandlerRegexes.some((regex) => regex.test(event.path))) {
        throw createError({
          statusCode: 404
        });
      }
    });
    await nuxt.callHook("server:devHandler", viteMiddleware);
  } else {
    logger.info("Building client...");
    const start = Date.now();
    logger.restoreAll();
    await vite.build(clientConfig);
    logger.wrapAll();
    await nuxt.callHook("vite:compiled");
    logger.success(`Client built in ${Date.now() - start}ms`);
  }
}

async function writeManifest(ctx) {
  const { nuxt } = ctx;
  const devClientManifest = {
    "@vite/client": {
      isEntry: true,
      file: "@vite/client",
      css: [],
      module: true,
      resourceType: "script"
    },
    ...nuxt.options.features.noScripts === "all" ? {} : {
      [ctx.entry]: {
        isEntry: true,
        file: ctx.entry,
        module: true,
        resourceType: "script"
      }
    }
  };
  const clientDist = resolve(nuxt.options.buildDir, "dist/client");
  const serverDist = resolve(nuxt.options.buildDir, "dist/server");
  const manifestFile = resolve(clientDist, "manifest.json");
  const clientManifest = nuxt.options.dev ? devClientManifest : JSON.parse(readFileSync(manifestFile, "utf-8"));
  const manifestEntries = Object.values(clientManifest);
  const buildAssetsDir = withTrailingSlash(withoutLeadingSlash(nuxt.options.app.buildAssetsDir));
  const BASE_RE = new RegExp(`^${escapeRE(buildAssetsDir)}`);
  for (const entry of manifestEntries) {
    entry.file &&= entry.file.replace(BASE_RE, "");
    for (const item of ["css", "assets"]) {
      entry[item] &&= entry[item].map((i) => i.replace(BASE_RE, ""));
    }
  }
  await mkdir(serverDist, { recursive: true });
  if (ctx.config.build?.cssCodeSplit === false) {
    for (const entry of manifestEntries) {
      if (entry.file?.endsWith(".css")) {
        const key = relative(ctx.config.root, ctx.entry);
        clientManifest[key].css ||= [];
        clientManifest[key].css.push(entry.file);
        break;
      }
    }
  }
  const manifest = normalizeViteManifest(clientManifest);
  await nuxt.callHook("build:manifest", manifest);
  const stringifiedManifest = JSON.stringify(manifest, null, 2);
  await writeFile(resolve(serverDist, "client.manifest.json"), stringifiedManifest, "utf8");
  await writeFile(resolve(serverDist, "client.manifest.mjs"), "export default " + stringifiedManifest, "utf8");
  if (!nuxt.options.dev) {
    await rm(manifestFile, { force: true });
  }
}

function transpile(envs) {
  const nuxt = useNuxt();
  const transpile2 = [];
  for (let pattern of nuxt.options.build.transpile) {
    if (typeof pattern === "function") {
      const result = pattern(envs);
      if (result) {
        pattern = result;
      }
    }
    if (typeof pattern === "string") {
      transpile2.push(new RegExp(escapeRE(normalize(pattern))));
    } else if (pattern instanceof RegExp) {
      transpile2.push(pattern);
    }
  }
  return transpile2;
}

const SourcemapPreserverPlugin = (nuxt) => {
  let outputDir;
  const ids = /* @__PURE__ */ new Set();
  if (!nuxt.options.sourcemap.server || nuxt.options.dev) {
    return [];
  }
  const nitroPlugin = {
    name: "nuxt:sourcemap-import",
    async load(id) {
      id = resolve(id);
      if (!ids.has(id)) {
        return;
      }
      const [code, map] = await Promise.all([
        readFile(id, "utf-8").catch(() => void 0),
        readFile(id + ".map.json", "utf-8").catch(() => void 0)
      ]);
      if (!code) {
        this.warn("Failed loading file");
        return null;
      }
      return {
        code,
        map
      };
    }
  };
  nuxt.hook("nitro:build:before", (nitro) => {
    nitro.options.rollupConfig = defu$1(nitro.options.rollupConfig, {
      plugins: [nitroPlugin]
    });
  });
  return {
    name: "nuxt:sourcemap-export",
    applyToEnvironment: (environment) => {
      return environment.name === "ssr" && environment.config.isProduction;
    },
    apply(config) {
      return !!config.build?.sourcemap;
    },
    configResolved(config) {
      outputDir = config.build.outDir;
    },
    async writeBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.map) {
          continue;
        }
        const id = resolve(outputDir, chunk.fileName);
        ids.add(id);
        const dest = id + ".map.json";
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, JSON.stringify({
          file: chunk.map.file,
          mappings: chunk.map.mappings,
          names: chunk.map.names,
          sources: chunk.map.sources,
          sourcesContent: chunk.map.sourcesContent,
          version: chunk.map.version
        }));
      }
    }
  };
};

function VueFeatureFlagsPlugin(nuxt) {
  return {
    name: "nuxt:nitro:vue-feature-flags",
    applyToEnvironment: (environment) => environment.name === "ssr" && environment.config.isProduction,
    configResolved(config) {
      for (const key in config.define) {
        if (key.startsWith("__VUE")) {
          nuxt._nitro.options.replace[key] = config.define[key];
        }
      }
    }
  };
}

async function buildServer(nuxt, ctx) {
  const serverEntry = nuxt.options.ssr ? ctx.entry : await resolvePath(resolve(nuxt.options.appDir, "entry-spa"));
  const serverConfig = vite.mergeConfig(ctx.config, vite.mergeConfig({
    configFile: false,
    base: nuxt.options.dev ? joinURL(nuxt.options.app.baseURL.replace(/^\.\//, "/") || "/", nuxt.options.app.buildAssetsDir) : void 0,
    css: {
      devSourcemap: !!nuxt.options.sourcemap.server
    },
    plugins: [
      VueFeatureFlagsPlugin(nuxt),
      // tell rollup's nitro build about the original sources of the generated vite server build
      SourcemapPreserverPlugin(nuxt)
    ],
    define: {
      "process.server": true,
      "process.client": false,
      "process.browser": false,
      "import.meta.server": true,
      "import.meta.client": false,
      "import.meta.browser": false,
      "window": "undefined",
      "document": "undefined",
      "navigator": "undefined",
      "location": "undefined",
      "XMLHttpRequest": "undefined"
    },
    optimizeDeps: {
      noDiscovery: true
    },
    resolve: {
      conditions: nuxt._nitro?.options.exportConditions
    },
    ssr: {
      external: [
        "nitro/runtime",
        // TODO: remove in v5
        "#internal/nitro",
        "#internal/nitro/utils"
      ],
      noExternal: [
        ...transpile({ isServer: true, isDev: nuxt.options.dev }),
        "/__vue-jsx",
        "#app",
        /^nuxt(\/|$)/,
        /(nuxt|nuxt3|nuxt-nightly)\/(dist|src|app)/
      ]
    },
    cacheDir: resolve(nuxt.options.rootDir, ctx.config.cacheDir ?? "node_modules/.cache/vite", "server"),
    build: {
      // we'll display this in nitro build output
      reportCompressedSize: false,
      sourcemap: nuxt.options.sourcemap.server ? ctx.config.build?.sourcemap ?? nuxt.options.sourcemap.server : false,
      outDir: resolve(nuxt.options.buildDir, "dist/server"),
      ssr: true,
      rollupOptions: {
        input: { server: serverEntry },
        external: [
          "nitro/runtime",
          // TODO: remove in v5
          "#internal/nitro",
          "nitropack/runtime",
          "#internal/nuxt/paths",
          "#internal/nuxt/app-config",
          "#app-manifest",
          "#shared",
          new RegExp("^" + escapeRE(withTrailingSlash(resolve(nuxt.options.rootDir, nuxt.options.dir.shared))))
        ],
        output: {
          entryFileNames: "[name].mjs",
          format: "module",
          generatedCode: {
            symbols: true,
            // temporary fix for https://github.com/vuejs/core/issues/8351,
            constBindings: true,
            // temporary fix for https://github.com/rollup/rollup/issues/5975
            arrowFunctions: true
          }
        },
        onwarn(warning, rollupWarn) {
          if (warning.code && "UNUSED_EXTERNAL_IMPORT" === warning.code) {
            return;
          }
          rollupWarn(warning);
        }
      }
    },
    server: {
      warmup: {
        ssrFiles: [serverEntry]
      },
      // https://github.com/vitest-dev/vitest/issues/229#issuecomment-1002685027
      preTransformRequests: false,
      hmr: false
    }
  }, nuxt.options.vite.$server || {}));
  if (serverConfig.build?.rollupOptions?.output && !Array.isArray(serverConfig.build.rollupOptions.output)) {
    serverConfig.build.rollupOptions.output.manualChunks = void 0;
  }
  serverConfig.customLogger = createViteLogger(serverConfig, { hideOutput: !nuxt.options.dev });
  await nuxt.callHook("vite:extendConfig", serverConfig, { isClient: false, isServer: true });
  serverConfig.plugins.unshift(
    vuePlugin(serverConfig.vue),
    viteJsxPlugin(serverConfig.vueJsx)
  );
  await nuxt.callHook("vite:configResolved", serverConfig, { isClient: false, isServer: true });
  if (!nuxt.options.dev) {
    const start = Date.now();
    logger.info("Building server...");
    logger.restoreAll();
    await vite.build(serverConfig);
    logger.wrapAll();
    await writeManifest(ctx);
    await nuxt.callHook("vite:compiled");
    logger.success(`Server built in ${Date.now() - start}ms`);
    return;
  }
  if (!nuxt.options.ssr) {
    await writeManifest(ctx);
    await nuxt.callHook("vite:compiled");
    return;
  }
  const ssrServer = await vite.createServer(serverConfig);
  ctx.ssrServer = ssrServer;
  nuxt.hook("close", () => ssrServer.close());
  await nuxt.callHook("vite:serverCreated", ssrServer, { isClient: false, isServer: true });
  await ssrServer.pluginContainer.buildStart({});
  await writeDevServer(nuxt);
}

function fileToUrl(file, root) {
  const url = relative(root, file);
  if (url[0] === ".") {
    return join("/@fs/", normalize(file));
  }
  return "/" + normalize(url);
}
function normaliseURL(url, base) {
  url = withoutBase(url, base);
  if (url.startsWith("/@id/")) {
    url = url.slice("/@id/".length).replace("__x00__", "\0");
  }
  url = url.replace(/(\?|&)import=?(?:&|$)/, "").replace(/[?&]$/, "");
  return url;
}
async function warmupViteServer(server, entries, isServer) {
  const warmedUrls = /* @__PURE__ */ new Set();
  const warmup = async (url) => {
    try {
      url = normaliseURL(url, server.config.base);
      if (warmedUrls.has(url) || isBuiltin(url)) {
        return;
      }
      const m = await server.moduleGraph.getModuleByUrl(url, isServer);
      if (m?.transformResult?.code || m?.ssrTransformResult?.code) {
        return;
      }
      warmedUrls.add(url);
      await server.transformRequest(url, { ssr: isServer });
    } catch (e) {
      logger.debug("[nuxt] warmup for %s failed with: %s", url, e);
    }
    if (isCSSRequest(url)) {
      return;
    }
    try {
      const mod = await server.moduleGraph.getModuleByUrl(url, isServer);
      const deps = mod?.ssrTransformResult?.deps || (mod?.importedModules.size ? Array.from(
        mod?.importedModules
        /* client */
      ).map((m) => m.url) : []);
      await Promise.all(deps.map((m) => warmup(m)));
    } catch (e) {
      logger.debug("[warmup] tracking dependencies for %s failed with: %s", url, e);
    }
  };
  await Promise.all(entries.map((entry) => warmup(fileToUrl(entry, server.config.root))));
}

function sortPlugins({ plugins, order }) {
  const names = Object.keys(plugins);
  return typeof order === "function" ? order(names) : order || names;
}
async function resolveCSSOptions(nuxt) {
  const css = {
    postcss: {
      plugins: []
    }
  };
  const postcssOptions = nuxt.options.postcss;
  const jiti = createJiti(nuxt.options.rootDir, { alias: nuxt.options.alias });
  for (const pluginName of sortPlugins(postcssOptions)) {
    const pluginOptions = postcssOptions.plugins[pluginName];
    if (!pluginOptions) {
      continue;
    }
    let pluginFn;
    for (const parentURL of nuxt.options.modulesDir) {
      pluginFn = await jiti.import(pluginName, { parentURL: parentURL.replace(/\/node_modules\/?$/, ""), try: true, default: true });
      if (typeof pluginFn === "function") {
        css.postcss.plugins.push(pluginFn(pluginOptions));
        break;
      }
    }
    if (typeof pluginFn !== "function") {
      console.warn(`[nuxt] could not import postcss plugin \`${pluginName}\`. Please report this as a bug.`);
    }
  }
  return css;
}

const SUPPORTED_FILES_RE = /\.(?:vue|(?:[cm]?j|t)sx?)$/;
function SSRStylesPlugin(options) {
  const cssMap = {};
  const idRefMap = {};
  const relativeToSrcDir = (path) => relative(options.srcDir, path);
  const warnCache = /* @__PURE__ */ new Set();
  const islands = options.components.filter(
    (component) => component.island || // .server components without a corresponding .client component will need to be rendered as an island
    component.mode === "server" && !options.components.some((c) => c.pascalName === component.pascalName && c.mode === "client")
  );
  return {
    name: "ssr-styles",
    resolveId: {
      order: "pre",
      async handler(id, importer, _options) {
        if (options.shouldInline === false || typeof options.shouldInline === "function" && !options.shouldInline(importer)) {
          return;
        }
        if (id === "#build/css" || id.endsWith(".vue") || isCSS(id)) {
          const res = await this.resolve(id, importer, { ..._options, skipSelf: true });
          if (res) {
            return {
              ...res,
              moduleSideEffects: false
            };
          }
        }
      }
    },
    generateBundle(outputOptions) {
      if (options.mode === "client") {
        return;
      }
      const emitted = {};
      for (const [file, { files, inBundle }] of Object.entries(cssMap)) {
        if (!files.length || !inBundle) {
          continue;
        }
        const fileName = filename(file);
        const base = typeof outputOptions.assetFileNames === "string" ? outputOptions.assetFileNames : outputOptions.assetFileNames({
          type: "asset",
          name: `${fileName}-styles.mjs`,
          names: [`${fileName}-styles.mjs`],
          originalFileName: `${fileName}-styles.mjs`,
          originalFileNames: [`${fileName}-styles.mjs`],
          source: ""
        });
        const baseDir = dirname(base);
        emitted[file] = this.emitFile({
          type: "asset",
          name: `${fileName}-styles.mjs`,
          source: [
            ...files.map((css, i) => `import style_${i} from './${relative(baseDir, this.getFileName(css))}';`),
            `export default [${files.map((_, i) => `style_${i}`).join(", ")}]`
          ].join("\n")
        });
      }
      for (const key in emitted) {
        options.chunksWithInlinedCSS.add(key);
      }
      this.emitFile({
        type: "asset",
        fileName: "styles.mjs",
        originalFileName: "styles.mjs",
        source: [
          "const interopDefault = r => r.default || r || []",
          `export default ${genObjectFromRawEntries(
            Object.entries(emitted).map(([key, value]) => [key, `() => import('./${this.getFileName(value)}').then(interopDefault)`])
          )}`
        ].join("\n")
      });
    },
    renderChunk(_code, chunk) {
      const isEntry = chunk.facadeModuleId === options.entry;
      if (isEntry) {
        options.clientCSSMap[chunk.facadeModuleId] ||= /* @__PURE__ */ new Set();
      }
      for (const moduleId of [chunk.facadeModuleId, ...chunk.moduleIds].filter(Boolean)) {
        if (options.mode === "client") {
          const moduleMap = options.clientCSSMap[moduleId] ||= /* @__PURE__ */ new Set();
          if (isCSS(moduleId)) {
            if (isVue(moduleId)) {
              moduleMap.add(moduleId);
              const parent = moduleId.replace(/\?.+$/, "");
              const parentMap = options.clientCSSMap[parent] ||= /* @__PURE__ */ new Set();
              parentMap.add(moduleId);
            }
            if (isEntry && chunk.facadeModuleId) {
              const facadeMap = options.clientCSSMap[chunk.facadeModuleId] ||= /* @__PURE__ */ new Set();
              facadeMap.add(moduleId);
            }
          }
          continue;
        }
        const relativePath = relativeToSrcDir(moduleId);
        if (relativePath in cssMap) {
          cssMap[relativePath].inBundle = cssMap[relativePath].inBundle ?? (isVue(moduleId) && !!relativeToSrcDir(moduleId) || isEntry);
        }
      }
      return null;
    },
    async transform(code, id) {
      if (options.mode === "client") {
        if (id === options.entry && (options.shouldInline === true || typeof options.shouldInline === "function" && options.shouldInline(id))) {
          const s = new MagicString(code);
          const idClientCSSMap = options.clientCSSMap[id] ||= /* @__PURE__ */ new Set();
          if (!options.globalCSS.length) {
            return;
          }
          for (const file of options.globalCSS) {
            const resolved = await this.resolve(file) ?? await this.resolve(file, id);
            const res = await this.resolve(file + "?inline&used") ?? await this.resolve(file + "?inline&used", id);
            if (!resolved || !res) {
              if (!warnCache.has(file)) {
                warnCache.add(file);
                this.warn(`[nuxt] Cannot extract styles for \`${file}\`. Its styles will not be inlined when server-rendering.`);
              }
              s.prepend(`${genImport(file)}
`);
              continue;
            }
            idClientCSSMap.add(resolved.id);
          }
          if (s.hasChanged()) {
            return {
              code: s.toString(),
              map: s.generateMap({ hires: true })
            };
          }
        }
        return;
      }
      const { pathname, search } = parseURL(decodeURIComponent(pathToFileURL(id).href));
      if (!(id in options.clientCSSMap) && !islands.some((c) => c.filePath === pathname)) {
        return;
      }
      const query = parseQuery(search);
      if (query.macro || query.nuxt_component) {
        return;
      }
      if (!islands.some((c) => c.filePath === pathname)) {
        if (options.shouldInline === false || typeof options.shouldInline === "function" && !options.shouldInline(id)) {
          return;
        }
      }
      const relativeId = relativeToSrcDir(id);
      const idMap = cssMap[relativeId] ||= { files: [] };
      const emittedIds = /* @__PURE__ */ new Set();
      let styleCtr = 0;
      const ids = options.clientCSSMap[id] || [];
      for (const file of ids) {
        const resolved = await this.resolve(file) ?? await this.resolve(file, id);
        const res = await this.resolve(file + "?inline&used") ?? await this.resolve(file + "?inline&used", id);
        if (!resolved || !res) {
          if (!warnCache.has(file)) {
            warnCache.add(file);
            this.warn(`[nuxt] Cannot extract styles for \`${file}\`. Its styles will not be inlined when server-rendering.`);
          }
          continue;
        }
        if (emittedIds.has(file)) {
          continue;
        }
        const ref = this.emitFile({
          type: "chunk",
          name: `${filename(id)}-styles-${++styleCtr}.mjs`,
          id: file + "?inline&used"
        });
        idRefMap[relativeToSrcDir(file)] = ref;
        idMap.files.push(ref);
      }
      if (!SUPPORTED_FILES_RE.test(pathname)) {
        return;
      }
      for (const i of findStaticImports(code)) {
        const { type } = parseQuery(i.specifier);
        if (type !== "style" && !i.specifier.endsWith(".css")) {
          continue;
        }
        const resolved = await this.resolve(i.specifier, id);
        if (!resolved) {
          continue;
        }
        if (!await this.resolve(resolved.id + "?inline&used")) {
          if (!warnCache.has(resolved.id)) {
            warnCache.add(resolved.id);
            this.warn(`[nuxt] Cannot extract styles for \`${i.specifier}\`. Its styles will not be inlined when server-rendering.`);
          }
          continue;
        }
        if (emittedIds.has(resolved.id)) {
          continue;
        }
        const ref = this.emitFile({
          type: "chunk",
          name: `${filename(id)}-styles-${++styleCtr}.mjs`,
          id: resolved.id + "?inline&used"
        });
        idRefMap[relativeToSrcDir(resolved.id)] = ref;
        idMap.files.push(ref);
      }
    }
  };
}
function filename(name) {
  return filename$1(name.replace(/\?.+$/, ""));
}

const bundle = async (nuxt) => {
  const useAsyncEntry = nuxt.options.experimental.asyncEntry || nuxt.options.dev;
  const entry = await resolvePath(resolve(nuxt.options.appDir, useAsyncEntry ? "entry.async" : "entry"));
  nuxt.options.modulesDir.push(distDir);
  let allowDirs = [
    nuxt.options.appDir,
    nuxt.options.workspaceDir,
    ...nuxt.options.modulesDir,
    ...nuxt.options._layers.map((l) => l.config.rootDir),
    ...Object.values(nuxt.apps).flatMap((app) => [
      ...app.components.map((c) => dirname(c.filePath)),
      ...app.plugins.map((p) => dirname(p.src)),
      ...app.middleware.map((m) => dirname(m.path)),
      ...Object.values(app.layouts || {}).map((l) => dirname(l.file)),
      dirname(nuxt.apps.default.rootComponent),
      dirname(nuxt.apps.default.errorComponent)
    ])
  ].filter((d) => d && existsSync(d));
  for (const dir of allowDirs) {
    allowDirs = allowDirs.filter((d) => !d.startsWith(dir) || d === dir);
  }
  const { $client, $server, ...viteConfig } = nuxt.options.vite;
  const mockEmpty = resolveModulePath("mocked-exports/empty", { from: import.meta.url });
  const helper = nuxt.options.nitro.imports !== false ? "" : "globalThis.";
  const isIgnored = createIsIgnored(nuxt);
  const ctx = {
    nuxt,
    entry,
    config: vite.mergeConfig(
      {
        logLevel: logLevelMap[nuxt.options.logLevel] ?? logLevelMap.info,
        experimental: {
          renderBuiltUrl: (filename2, { type, hostType, ssr }) => {
            if (hostType !== "js") {
              return { relative: true };
            }
            if (!ssr) {
              if (type === "asset") {
                return { relative: true };
              }
              return { runtime: `globalThis.__publicAssetsURL(${JSON.stringify(filename2)})` };
            }
            if (type === "public") {
              return { runtime: `${helper}__publicAssetsURL(${JSON.stringify(filename2)})` };
            }
            if (type === "asset") {
              const relativeFilename = filename2.replace(withTrailingSlash(withoutLeadingSlash(nuxt.options.app.buildAssetsDir)), "");
              return { runtime: `${helper}__buildAssetsURL(${JSON.stringify(relativeFilename)})` };
            }
          }
        },
        resolve: {
          alias: {
            [basename(nuxt.options.dir.assets)]: resolve(nuxt.options.srcDir, nuxt.options.dir.assets),
            ...nuxt.options.alias,
            "#app": nuxt.options.appDir,
            "web-streams-polyfill/ponyfill/es2018": mockEmpty,
            // Cannot destructure property 'AbortController' of ..
            "abort-controller": mockEmpty
          },
          dedupe: [
            "vue"
          ]
        },
        css: await resolveCSSOptions(nuxt),
        define: {
          __NUXT_VERSION__: JSON.stringify(nuxt._version),
          __NUXT_ASYNC_CONTEXT__: nuxt.options.experimental.asyncContext
        },
        build: {
          copyPublicDir: false,
          rollupOptions: {
            output: {
              sourcemapIgnoreList: (relativeSourcePath) => {
                return relativeSourcePath.includes("node_modules") || relativeSourcePath.includes(nuxt.options.buildDir);
              },
              sanitizeFileName: sanitizeFilePath,
              // https://github.com/vitejs/vite/tree/main/packages/vite/src/node/build.ts#L464-L478
              assetFileNames: nuxt.options.dev ? void 0 : (chunk) => withoutLeadingSlash(join(nuxt.options.app.buildAssetsDir, `${sanitizeFilePath(filename$1(chunk.names[0]))}.[hash].[ext]`))
            }
          },
          watch: {
            chokidar: { ...nuxt.options.watchers.chokidar, ignored: [isIgnored, /[\\/]node_modules[\\/]/] },
            exclude: nuxt.options.ignore
          }
        },
        plugins: [
          // add resolver for files in public assets directories
          PublicDirsPlugin({
            dev: nuxt.options.dev,
            baseURL: nuxt.options.app.baseURL
          })
        ],
        server: {
          watch: { ...nuxt.options.watchers.chokidar, ignored: [isIgnored, /[\\/]node_modules[\\/]/] },
          fs: {
            allow: [...new Set(allowDirs)]
          }
        }
      },
      viteConfig
    )
  };
  if (!nuxt.options.dev) {
    ctx.config.server.watch = void 0;
    ctx.config.build.watch = void 0;
  }
  if (nuxt.options.dev) {
    const layerDirs = [];
    const delimitedRootDir = nuxt.options.rootDir + "/";
    for (const layer of nuxt.options._layers) {
      if (layer.config.srcDir !== nuxt.options.srcDir && !layer.config.srcDir.startsWith(delimitedRootDir)) {
        layerDirs.push(layer.config.srcDir + "/");
      }
    }
    if (layerDirs.length > 0) {
      layerDirs.sort().reverse();
      nuxt.hook("vite:extendConfig", (config) => {
        const dirs = [...layerDirs];
        config.plugins.push({
          name: "nuxt:optimize-layer-deps",
          enforce: "pre",
          async resolveId(source, _importer) {
            if (!_importer || !dirs.length) {
              return;
            }
            const importer = normalize(_importer);
            const layerIndex = dirs.findIndex((dir) => importer.startsWith(dir));
            if (layerIndex !== -1) {
              dirs.splice(layerIndex, 1);
              await this.resolve(source, join(nuxt.options.srcDir, "index.html"), { skipSelf: true }).catch(() => null);
            }
          }
        });
      });
    }
  }
  if (!nuxt.options.test && (nuxt.options.typescript.typeCheck === true || nuxt.options.typescript.typeCheck === "build" && !nuxt.options.dev)) {
    const checker = await import('vite-plugin-checker').then((r) => r.default);
    addVitePlugin(checker({
      vueTsc: {
        tsconfigPath: await resolveTSConfig(nuxt.options.rootDir)
      }
    }), { server: nuxt.options.ssr });
  }
  await nuxt.callHook("vite:extend", ctx);
  nuxt.hook("vite:extendConfig", (config) => {
    const replaceOptions = /* @__PURE__ */ Object.create(null);
    replaceOptions.preventAssignment = true;
    for (const key in config.define) {
      if (key.startsWith("import.meta.")) {
        replaceOptions[key] = config.define[key];
      }
    }
    config.plugins.push(replace(replaceOptions));
  });
  if (!nuxt.options.dev) {
    const chunksWithInlinedCSS = /* @__PURE__ */ new Set();
    const clientCSSMap = {};
    nuxt.hook("vite:extendConfig", (config, { isServer }) => {
      config.plugins.unshift(SSRStylesPlugin({
        srcDir: nuxt.options.srcDir,
        clientCSSMap,
        chunksWithInlinedCSS,
        shouldInline: nuxt.options.features.inlineStyles,
        components: nuxt.apps.default.components || [],
        globalCSS: nuxt.options.css,
        mode: isServer ? "server" : "client",
        entry: ctx.entry
      }));
    });
    nuxt.hook("build:manifest", (manifest) => {
      for (const [key, entry2] of Object.entries(manifest)) {
        const shouldRemoveCSS = chunksWithInlinedCSS.has(key) && !entry2.isEntry;
        if (entry2.isEntry && chunksWithInlinedCSS.has(key)) {
          entry2._globalCSS = true;
        }
        if (shouldRemoveCSS && entry2.css) {
          entry2.css = [];
        }
      }
    });
  }
  nuxt.hook("vite:serverCreated", (server, env) => {
    nuxt.hook("app:templatesGenerated", async (_app, changedTemplates) => {
      await Promise.all(changedTemplates.map(async (template) => {
        for (const mod of server.moduleGraph.getModulesByFile(`virtual:nuxt:${encodeURIComponent(template.dst)}`) || []) {
          server.moduleGraph.invalidateModule(mod);
          await server.reloadModule(mod);
        }
      }));
    });
    if (nuxt.options.vite.warmupEntry !== false) {
      useNitro().hooks.hookOnce("compiled", () => {
        const start = Date.now();
        warmupViteServer(server, [ctx.entry], env.isServer).then(() => logger.info(`Vite ${env.isClient ? "client" : "server"} warmed up in ${Date.now() - start}ms`)).catch(logger.error);
      });
    }
  });
  await withLogs(() => buildClient(nuxt, ctx), "Vite client built", nuxt.options.dev);
  await withLogs(() => buildServer(nuxt, ctx), "Vite server built", nuxt.options.dev);
};
async function withLogs(fn, message, enabled = true) {
  if (!enabled) {
    return fn();
  }
  const start = performance.now();
  await fn();
  const duration = performance.now() - start;
  logger.success(`${message} in ${Math.round(duration)}ms`);
}

export { bundle };
