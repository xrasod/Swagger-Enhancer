import esbuild from "esbuild";
import fs from "fs";

const watch = process.argv.includes("--watch");

const ctx = await esbuild.context({
  entryPoints: ["src/content.ts"],
  bundle: true,
  format: "iife",
  outfile: "dist/content.js",
  logLevel: "info",
});

fs.mkdirSync("dist", { recursive: true });
fs.copyFileSync("src/styles.css", "dist/styles.css");
fs.copyFileSync("manifest.json", "dist/manifest.json");

if (watch) {
  await ctx.watch();
  console.log("Watching for changes…");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
