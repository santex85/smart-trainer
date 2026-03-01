#!/usr/bin/env node
/**
 * Generates PWA icons (192x192, 512x512) from assets/icon.png into public/.
 * If icon.png is missing or invalid, creates solid-color fallback icons using theme background.
 */

const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const ICON_SRC = path.join(ROOT, "assets", "icon.png");
const PUBLIC_DIR = path.join(ROOT, "public");
const SIZES = [192, 512];
const FALLBACK_COLOR = "#1a1a2e"; // theme background from colors.ts

async function main() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.error("Run: npm install --save-dev sharp");
    process.exit(1);
  }

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  const iconPath = path.join(ROOT, "assets", "icon.png");
  const iconExists = fs.existsSync(iconPath) && fs.statSync(iconPath).size > 100;

  let input;
  if (iconExists) {
    try {
      input = sharp(iconPath);
      await input.metadata();
    } catch (e) {
      console.warn("Could not read assets/icon.png, using fallback:", e.message);
      input = null;
    }
  } else {
    input = null;
  }

  if (!input) {
    const size = 512;
    const buffer = Buffer.alloc(size * size * 4);
    const hex = FALLBACK_COLOR.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    for (let i = 0; i < size * size; i++) {
      buffer[i * 4] = r;
      buffer[i * 4 + 1] = g;
      buffer[i * 4 + 2] = b;
      buffer[i * 4 + 3] = 255;
    }
    input = sharp(buffer, {
      raw: { width: size, height: size, channels: 4 },
    });
  }

  for (const size of SIZES) {
    const outPath = path.join(PUBLIC_DIR, `logo${size}.png`);
    await input
      .clone()
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log("Wrote", outPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
