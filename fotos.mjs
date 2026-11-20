// Fotos de conferência do vídeo: node fotos.mjs [frações separadas por vírgula] [cena ...]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
const dur = JSON.parse(fs.readFileSync("src/duracoes.json", "utf8"));
const ordem = Object.keys(dur);
const fps = 30;
const pontos = (process.argv[2] || "0.5").split(",").map(Number);
const so = process.argv.slice(3);
fs.mkdirSync("out/fotos", { recursive: true });
const serveUrl = await bundle({ entryPoint: "video/index.ts", rspack: true });
const chromiumOptions = { gl: "angle" };
const comp = await selectComposition({ serveUrl, id: "ComoFuncionaEmail", chromiumOptions });
let ini = 0;
for (const id of ordem) {
  const n = Math.ceil((dur[id] + 1.1) * fps);
  if (!so.length || so.includes(id))
    for (const p of pontos)
      await renderStill({ composition: comp, serveUrl, chromiumOptions, frame: ini + Math.min(n - 1, Math.floor(15 + dur[id] * fps * p)), imageFormat: "jpeg", jpegQuality: 82,
        output: `out/fotos/${String(ordem.indexOf(id) + 1).padStart(2, "0")}-${id}-${String(Math.round(p * 100)).padStart(3, "0")}.jpg` });
  ini += n;
}
console.log("fotos ok");
