import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const assetLimit = 25 * 1024 * 1024;
const outputDirectory = new URL("../src/utils/generated-duckdb/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

await Promise.all(
  ["mvp", "eh"].map(async (variant) => {
    const filename = `duckdb-${variant}.wasm.gz`;
    const source = new URL(
      `../node_modules/@duckdb/duckdb-wasm/dist/duckdb-${variant}.wasm`,
      import.meta.url,
    );
    const output = new URL(filename, outputDirectory);
    await pipeline(createReadStream(source), createGzip(), createWriteStream(output));
    const { size } = await stat(output);
    if (size > assetLimit) {
      throw new Error(
        `${filename} is ${size} bytes, exceeding Cloudflare Workers' 25 MiB asset limit`,
      );
    }
    console.log(`${filename}: ${(size / 1024 / 1024).toFixed(1)} MiB`);
  }),
);
