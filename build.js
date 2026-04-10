#!/usr/bin/env node
// Build script: transforms app.jsx → index.html
// React is loaded from CDN, so we swap the import for a global destructure.

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const version = process.argv[2] || "2.1";

let src = fs.readFileSync("app.jsx", "utf8");

// Swap React import for CDN global destructure
src = src.replace(
  /import\s*\{([^}]+)\}\s*from\s*["']react["'];?/,
  (_, names) => `const {${names}} = React;`
);

// Remove export default so esbuild doesn't complain in iife mode
src = src.replace(/^export default /m, "");

// Append render call
src += `\nconst __root = ReactDOM.createRoot(document.getElementById("root"));\n__root.render(React.createElement(App));\n`;

// Write temp file
fs.writeFileSync("_build_temp.jsx", src);

// esbuild: JSX transform + iife, no bundling of React
execSync(
  `npx --yes esbuild _build_temp.jsx --jsx=transform --jsx-factory=React.createElement --target=es2015 --format=iife --outfile=_build_bundle.js`,
  { stdio: "inherit" }
);

const bundle = fs.readFileSync("_build_bundle.js", "utf8");

// Embed config.js if present (contains Monzo clientId — gitignored, never pushed)
let configScript = "window.MONZO_CONFIG = null; // config.js not found — Monzo OAuth disabled";
try {
  configScript = fs.readFileSync("config.js", "utf8");
  console.log("Embedded config.js (Monzo OAuth enabled)");
} catch(e) {
  console.warn("Warning: config.js not found — Monzo OAuth disabled. Copy config.js.template to config.js.");
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Finance">
<title>Finance Tracker v${version}</title>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script>${configScript}</script>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0a0b0f;color:#e2e4ec;font-family:"DM Mono","Courier New",monospace;-webkit-text-size-adjust:100%;}
input,textarea,button{font-family:inherit;}
::-webkit-scrollbar{display:none;}
</style>
</head>
<body>
<div id="root"></div>
<script>
${bundle}
</script>
</body>
</html>`;

fs.writeFileSync("index.html", html);

// Cleanup
fs.unlinkSync("_build_temp.jsx");
fs.unlinkSync("_build_bundle.js");

console.log(`Built index.html (v${version})`);
