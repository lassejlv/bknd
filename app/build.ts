import { $ } from "bun";
import * as esbuild from "esbuild";
import postcss from "esbuild-postcss";
import * as tsup from "tsup";
import { guessMimeType } from "./src/media/storage/mime-types";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const minify = args.includes("--minify");
const types = args.includes("--types");
const sourcemap = args.includes("--sourcemap");

await $`rm -rf dist`;
if (types) {
   Bun.spawn(["bun", "build:types"], {
      onExit: () => {
         console.log("Types built");
      }
   });
}

/**
 * Build static assets
 * Using esbuild because tsup doesn't include "react"
 */
const result = await esbuild.build({
   minify,
   sourcemap,
   entryPoints: ["src/ui/main.tsx"],
   entryNames: "[dir]/[name]-[hash]",
   outdir: "dist/static",
   platform: "browser",
   bundle: true,
   splitting: true,
   metafile: true,
   drop: ["console", "debugger"],
   inject: ["src/ui/inject.js"],
   target: "es2022",
   format: "esm",
   plugins: [postcss()],
   loader: {
      ".svg": "dataurl",
      ".js": "jsx"
   },
   define: {
      __isDev: "0",
      "process.env.NODE_ENV": '"production"'
   },
   chunkNames: "chunks/[name]-[hash]"
});

// Write manifest
{
   const manifest: Record<string, object> = {};
   const toAsset = (output: string) => {
      const name = output.split("/").pop()!;
      return {
         name,
         path: output,
         mime: guessMimeType(name)
      };
   };

   const info = Object.entries(result.metafile.outputs)
      .filter(([, meta]) => {
         return meta.entryPoint && meta.entryPoint === "src/ui/main.tsx";
      })
      .map(([output, meta]) => ({ output, meta }));

   for (const { output, meta } of info) {
      manifest[meta.entryPoint as string] = toAsset(output);
      if (meta.cssBundle) {
         manifest["src/ui/main.css"] = toAsset(meta.cssBundle);
      }
   }

   const manifest_file = "dist/static/manifest.json";
   await Bun.write(manifest_file, JSON.stringify(manifest, null, 2));
   console.log(`Manifest written to ${manifest_file}`, manifest);
}

/**
 * Building backend and general API
 */
await tsup.build({
   minify,
   sourcemap,
   watch,
   entry: ["src/index.ts", "src/data/index.ts", "src/core/index.ts", "src/core/utils/index.ts"],
   outDir: "dist",
   external: ["bun:test"],
   metafile: true,
   platform: "browser",
   format: ["esm", "cjs"],
   splitting: false,
   loader: {
      ".svg": "dataurl"
   }
});

/**
 * Building UI for direct imports
 */
await tsup.build({
   minify,
   sourcemap,
   watch,
   entry: ["src/ui/index.ts", "src/ui/client/index.ts", "src/ui/main.css"],
   outDir: "dist/ui",
   external: ["bun:test"],
   metafile: true,
   platform: "browser",
   format: ["esm", "cjs"],
   splitting: true,
   loader: {
      ".svg": "dataurl"
   },
   onSuccess: async () => {
      console.log("--- ui built");
   },
   esbuildOptions: (options) => {
      options.chunkNames = "chunks/[name]-[hash]";
   }
});

/**
 * Building adapters
 */
function baseConfig(adapter: string): tsup.Options {
   return {
      minify,
      sourcemap,
      watch,
      entry: [`src/adapter/${adapter}`],
      format: ["esm"],
      platform: "neutral",
      outDir: `dist/adapter/${adapter}`,
      define: {
         __isDev: "0"
      },
      external: [
         /^cloudflare*/,
         /^@?(hono|libsql).*?/,
         /^(bknd|react|next|node).*?/,
         /.*\.(html)$/
      ],
      metafile: true,
      splitting: false,
      treeshake: true
   };
}

await tsup.build({
   ...baseConfig("vite"),
   platform: "node"
});

await tsup.build({
   ...baseConfig("cloudflare")
});

await tsup.build({
   ...baseConfig("nextjs"),
   format: ["esm", "cjs"],
   platform: "node"
});

await tsup.build({
   ...baseConfig("remix"),
   format: ["esm", "cjs"]
});

await tsup.build({
   ...baseConfig("bun")
});

await tsup.build({
   ...baseConfig("node"),
   platform: "node",
   format: ["esm", "cjs"]
});

await tsup.build({
   ...baseConfig("astro"),
   format: ["esm", "cjs"]
});
