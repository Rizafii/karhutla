import { Worker } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("boots the locally published MapLibre worker without a CDN", async () => {
  const { version } = JSON.parse(
    await readFile(resolve("node_modules/maplibre-gl/package.json"), "utf8"),
  );
  const url = pathToFileURL(
    resolve(`public/maplibre/${version}/maplibre-gl-worker.mjs`),
  ).href;
  // Node worker_threads supplies the execution context; only browser-global
  // names are shimmed. The actual copied MapLibre module is imported intact.
  const worker = new Worker(`
    const { parentPort } = require('node:worker_threads');
    globalThis.self = globalThis;
    globalThis.WorkerGlobalScope = class {
      static [Symbol.hasInstance](value) { return value === globalThis; }
    };
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    globalThis.postMessage = () => {};
    import(${JSON.stringify(url)}).then(() => {
      parentPort.postMessage({
        ready: !!self.worker && typeof self.addProtocol === 'function',
      });
    }).catch(error => { throw error; });
  `, { eval: true });
  try {
    const result = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    expect(result).toEqual({ ready: true });
  } finally {
    await worker.terminate();
  }
}, 10000);
