#!/usr/bin/env node
/**
 * Generates app icons (icon.png, adaptive-icon.png) for Android/iOS from logo source.
 * Crops to center square (removes outer background) and resizes to 1024x1024.
 */

const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const SOURCE = path.join(ASSETS, "logo-source.png");
const ICON_OUT = path.join(ASSETS, "icon.png");
const ADAPTIVE_OUT = path.join(ASSETS, "adaptive-icon.png");
const SIZE = 1024;

async function main() {
  const sharp = require("sharp");

  if (!fs.existsSync(SOURCE)) {
    console.error("Source image not found:", SOURCE);
    console.error("Place your logo as assets/logo-source.png and run again.");
    process.exit(1);
  }

  const img = sharp(SOURCE);
  const meta = await img.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;

  if (!w || !h) {
    console.error("Could not read image dimensions");
    process.exit(1);
  }

  // Crop to center square to remove outer background
  const size = Math.min(w, h);
  const left = Math.floor((w - size) / 2);
  const top = Math.floor((h - size) / 2);

  const pipeline = img.extract({ left, top, width: size, height: size }).resize(SIZE, SIZE);

  await pipeline.png().toFile(ICON_OUT);
  console.log("Wrote", ICON_OUT);

  await sharp(SOURCE).extract({ left, top, width: size, height: size }).resize(SIZE, SIZE).png().toFile(ADAPTIVE_OUT);
  console.log("Wrote", ADAPTIVE_OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
