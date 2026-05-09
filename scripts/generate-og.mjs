import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));

const svgPath = resolve(__dirname, "..", "public", "og-default.svg");
const pngPath = resolve(__dirname, "..", "public", "og-default.png");

const svg = readFileSync(svgPath);
await sharp(svg).resize(1200, 630).png().toFile(pngPath);

console.log("OG image generated: og-default.png");
