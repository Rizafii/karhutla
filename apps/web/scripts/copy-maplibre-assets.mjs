import { createRequire } from "node:module";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("maplibre-gl/package.json");
const { version } = JSON.parse(await readFile(packagePath, "utf8"));
const destination = fileURLToPath(new URL(`../public/maplibre/${version}/`, import.meta.url));
await mkdir(destination, { recursive: true });
// The worker imports its shared module using a relative URL. Keep both in
// the same versioned directory; no CDN or runtime download is required.
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(dirname(packagePath), "dist", name), join(destination, name));
}
await copyFile(join(dirname(packagePath), "LICENSE.txt"), join(destination, "LICENSE.txt"));
console.log(`Prepared local MapLibre ${version} worker assets`);
