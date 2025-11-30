// utils/imageManifest.js

// [LINE 1]  Import modules we need
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// [LINE 6]  Re-create __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// [LINE 10]  Project root is one level above /utils
const ROOT_DIR = path.join(__dirname, "..");

// [LINE 13]  Full path to our manifest JSON file
const MANIFEST_PATH = path.join(ROOT_DIR, "data", "image_manifest.json");

// [LINE 16]  Make sure the manifest file exists and is valid JSON
async function ensureManifestFileExists() {
  try {
    await fs.access(MANIFEST_PATH);
    // File exists, nothing to do
  } catch (err) {
    // File does NOT exist → create with default content
    const defaultContent = {
      lastIndex: -1,
      images: []
    };

    await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
    await fs.writeFile(
      MANIFEST_PATH,
      JSON.stringify(defaultContent, null, 2),
      "utf8"
    );
  }
}

// [LINE 36]  Read manifest content safely, always return a valid object
async function readManifest() {
  await ensureManifestFileExists();

  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw);

    // Basic safety checks
    if (
      typeof parsed.lastIndex !== "number" ||
      !Array.isArray(parsed.images)
    ) {
      throw new Error("Manifest has wrong structure");
    }

    return parsed;
  } catch (err) {
    // If file is corrupted, reset it
    const resetContent = {
      lastIndex: -1,
      images: []
    };

    await fs.writeFile(
      MANIFEST_PATH,
      JSON.stringify(resetContent, null, 2),
      "utf8"
    );

    return resetContent;
  }
}

// [LINE 64]  Save manifest back to disk
async function writeManifest(manifest) {
  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
}

// [LINE 72]  Convert a number (0,1,2,...) to a 6-letter code AAAAAA, AAAAAB, etc.
function indexToCode(index) {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const CODE_LENGTH = 6;

  if (index < 0) {
    throw new Error("indexToCode: index must be >= 0");
  }

  // We treat index as a base-26 number and pad to 6 letters.
  let remaining = index;
  const chars = new Array(CODE_LENGTH);

  for (let i = CODE_LENGTH - 1; i >= 0; i--) {
    const value = remaining % 26; // remainder 0–25
    remaining = Math.floor(remaining / 26);
    chars[i] = LETTERS[value];
  }

  return chars.join("");
}

// [LINE 96]  Extract timestamp from filename like: scene_s_xxx_1763980909704.webp
function extractTimestampFromFilename(filename) {
  // Regex: last _numbers before .webp/.png/.jpg/.jpeg
  const match = filename.match(/_(\d+)\.(webp|png|jpe?g)$/i);
  if (!match) {
    return null;
  }
  const timestampString = match[1];
  const timestampNumber = Number(timestampString);

  if (!Number.isFinite(timestampNumber)) {
    return null;
  }

  return timestampNumber;
}

// [LINE 113]  Format timestamp as ISO and a local human-readable string
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);

  const iso = date.toISOString(); // e.g. 2025-11-24T15:03:10.704Z

  // Human-readable local string, up to seconds
  const local = date.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return {
    iso,
    local
  };
}

// [LINE 130]  Main function: register a newly generated image
export async function registerGeneratedImage(filename) {
  try {
    // 1) Get the timestamp from the filename
    const timestamp = extractTimestampFromFilename(filename);
    if (timestamp === null) {
      console.warn(
        "[IMAGE MANIFEST] Could not extract timestamp from filename:",
        filename
      );
      return;
    }

    // 2) Format timestamp into strings
    const { iso, local } = formatTimestamp(timestamp);

    // 3) Load current manifest
    const manifest = await readManifest();

    const newIndex = manifest.lastIndex + 1;
    const code = indexToCode(newIndex);

    // 4) Build new entry
    const newEntry = {
      index: newIndex,
      code, // e.g. "AAAAAA"
      filename, // e.g. "scene_s_3glgr2by_1763980909704.webp"
      timestamp, // raw number
      createdAtIso: iso, // e.g. "2025-11-24T15:03:10.704Z"
      createdAtLocal: local // e.g. "24/11/2025, 17:03:10"
    };

    // 5) Push into array and update lastIndex
    manifest.images.push(newEntry);
    manifest.lastIndex = newIndex;

    // 6) Save back to disk
    await writeManifest(manifest);

    console.log("[IMAGE MANIFEST] Registered image:", newEntry);
  } catch (err) {
    console.error("[IMAGE MANIFEST] Error while registering image:", err);
  }
}
