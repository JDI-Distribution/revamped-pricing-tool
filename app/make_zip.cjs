const fs   = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const dist   = path.resolve(__dirname, "dist");
const pkgSrc = path.resolve(__dirname, "../client/client-package.json");
const out    = path.resolve(__dirname, "../out.zip");

// Post-process: rename dotted chunk names Catalyst rejects
const renames = { "purify.es.js": "purify_es.js", "index.es.js": "index_es.js" };
for (const [from, to] of Object.entries(renames)) {
  const src = path.join(dist, "assets", from);
  const dst = path.join(dist, "assets", to);
  if (fs.existsSync(src)) { fs.renameSync(src, dst); console.log(`Renamed: ${from} → ${to}`); }
}
// Patch references inside JS files
for (const file of fs.readdirSync(path.join(dist, "assets"))) {
  if (!file.endsWith(".js")) continue;
  const fp = path.join(dist, "assets", file);
  let c = fs.readFileSync(fp, "utf8");
  const p = c.replace(/purify\.es\.js/g, "purify_es.js").replace(/index\.es\.js/g, "index_es.js");
  if (p !== c) { fs.writeFileSync(fp, p, "utf8"); console.log(`Patched: ${file}`); }
}

// Build zip with forward slashes
const zip = new AdmZip();
fs.copyFileSync(pkgSrc, path.join(dist, "client-package.json"));

function addDir(dir, base) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel  = base ? base + "/" + entry : entry;
    if (fs.statSync(full).isDirectory()) { addDir(full, rel); }
    else if (!rel.endsWith(".zip") && !rel.endsWith(".cjs")) { zip.addFile(rel, fs.readFileSync(full)); }
  }
}
addDir(dist, "");

if (fs.existsSync(out)) fs.unlinkSync(out);
zip.writeZip(out);
fs.unlinkSync(path.join(dist, "client-package.json"));

console.log("✓ out.zip ready:", out);
