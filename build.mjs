import esbuild from "esbuild";
import fs from "fs";
import { execFileSync } from "child_process";
import path from "path";

const watch = process.argv.includes("--watch");
const browsers = process.argv.includes("--chrome-only")
  ? ["chrome"]
  : process.argv.includes("--firefox-only")
    ? ["firefox"]
    : ["chrome", "firefox"];

for (const b of browsers) fs.mkdirSync(`dist/${b}`, { recursive: true });

const copyAssets = () => {
  for (const b of browsers) {
    fs.copyFileSync("src/styles.css", `dist/${b}/styles.css`);
    fs.copyFileSync(`manifests/${b}.json`, `dist/${b}/manifest.json`);
  }
  // Build targets chrome; mirror to firefox when both are requested
  if (browsers.includes("firefox") && browsers.includes("chrome")) {
    fs.copyFileSync("dist/chrome/content.js", "dist/firefox/content.js");
  }
};

const ctx = await esbuild.context({
  entryPoints: ["src/content.ts"],
  bundle: true,
  format: "iife",
  outfile: `dist/${browsers[0]}/content.js`,
  logLevel: "info",
  plugins: [{ name: "copy-assets", setup: (b) => b.onEnd(copyAssets) }],
});

const zipDist = () => {
  for (const b of browsers) {
    const zipPath = path.resolve(`dist/swagger-enhancer-${b}.zip`);
    fs.rmSync(zipPath, { force: true });
    execFileSync("zip", ["-rq", zipPath, "."], { cwd: `dist/${b}` });
    console.log(`  zipped dist/swagger-enhancer-${b}.zip`);
  }
};

if (watch) {
  await ctx.watch();
  console.log(`Watching for changes… [targets: ${browsers.join(", ")}]`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
  zipDist();
}
