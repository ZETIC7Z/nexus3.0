#!/usr/bin/env node
// rebrand.mjs — NEXUS Global Brand Replacement Script
// Run: node rebrand.mjs (from project root after cloning p-stream)
// Replaces ALL P-Stream, Z-Stream, pstream, zstream references with NEXUS

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const REPLACEMENTS = [
  // Exact capitalizations first
  [/P-Stream's/g, "NEXUS's"],
  [/P-Stream/g, "NEXUS"],
  [/p-stream/g, "nexus"],
  [/Z-Stream/g, "NEXUS"],
  [/z-stream/g, "nexus"],
  [/ZStream/g, "NEXUS"],
  [/zstream/g, "nexus"],
  [/PStream/g, "NEXUS"],
  [/pstream/g, "nexus"],
  // Legacy movie-web references
  [/movie-web/g, "nexus"],
  [/MovieWeb/g, "NEXUS"],
  // Domain references
  [/pstream\.net/g, "nexus.zeticuz.online"],
  [/pstream\.mov/g, "nexus.zeticuz.online"],
  [/zstream\.mov/g, "nexus.zeticuz.online"],
  // GitHub references  
  [/xp-technologies-dev\/p-stream/g, "ZETIC7Z/NEXUS"],
  [/p-stream\/p-stream/g, "ZETIC7Z/NEXUS"],
  // Discord
  [/discord\.gg\/rVa8jzGR/g, "discord.gg/nexus"],
];

const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".json",
  ".html", ".css", ".md", ".txt", ".yaml", ".yml", ".toml",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".cache",
  "vendor", "public", // Skip public (binary assets)
]);

let totalFiles = 0;
let modifiedFiles = 0;

function processFile(filePath) {
  const ext = extname(filePath);
  if (!ALLOWED_EXTENSIONS.has(ext)) return;

  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  let modified = content;
  for (const [pattern, replacement] of REPLACEMENTS) {
    modified = modified.replace(pattern, replacement);
  }

  totalFiles++;
  if (modified !== content) {
    writeFileSync(filePath, modified, "utf-8");
    modifiedFiles++;
    console.log(`  ✓ ${filePath}`);
  }
}

function walkDir(dirPath) {
  let entries;
  try {
    entries = readdirSync(dirPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".github") continue;
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dirPath, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else {
      processFile(fullPath);
    }
  }
}

console.log("\n🔄 NEXUS Brand Replacement Tool");
console.log("================================\n");
console.log("Scanning source files...\n");

walkDir(".");

console.log(`\n✅ Done! Modified ${modifiedFiles}/${totalFiles} files.\n`);

// Special handling for index.html and manifest.json in root
// (These need a full replacement from patches/)
console.log("Note: Replace index.html and manifest.json manually from the patches/ folder.");
console.log("      Run: cp patches/index.html . && cp patches/manifest.json .\n");
