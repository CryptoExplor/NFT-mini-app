import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const MIN_SIZE_BYTES = 100 * 1024;
const MAX_DIMENSION = 1400;
const DRY_RUN = process.argv.includes('--dry-run');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const UI_ASSET_PREFIXES = [
  'favicon',
  'apple-touch-icon',
  'android-chrome',
  'icon',
  'site.',
  'sw.',
  'demo',
  'splash',
  'farcaster'
];
const KEEP_PNG_SHARE_ONLY = new Set(['image.png', 'image1.png']);

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function toRelative(filePath) {
  return path.relative(process.cwd(), filePath).split(path.sep).join('/');
}

function isUiAsset(fileName) {
  const lower = fileName.toLowerCase();
  return UI_ASSET_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function shouldGenerateWebp(fileName) {
  const lower = fileName.toLowerCase();
  if (KEEP_PNG_SHARE_ONLY.has(lower)) return false;
  if (isUiAsset(lower)) return false;
  if (lower.includes('-share')) return false;
  return true;
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function fileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

async function writeFileSafely(filePath, buffer) {
  if (DRY_RUN) return true;
  try {
    await fs.writeFile(filePath, buffer);
    return true;
  } catch (error) {
    console.warn(`[warn] Failed to write ${toRelative(filePath)}: ${error.message}`);
    return false;
  }
}

async function optimizeOriginal(filePath, ext, resizeOptions) {
  let pipeline = sharp(filePath, { failOn: 'none' });
  if (resizeOptions) {
    pipeline = pipeline.resize(resizeOptions);
  }

  if (ext === '.png') {
    return pipeline
      .png({
        compressionLevel: 9,
        palette: true,
        quality: 82,
        effort: 10
      })
      .toBuffer();
  }

  return pipeline
    .jpeg({
      quality: 82,
      mozjpeg: true
    })
    .toBuffer();
}

async function optimizeToWebp(filePath, resizeOptions) {
  let pipeline = sharp(filePath, { failOn: 'none' });
  if (resizeOptions) {
    pipeline = pipeline.resize(resizeOptions);
  }

  return pipeline
    .webp({
      quality: 78,
      effort: 6
    })
    .toBuffer();
}

async function main() {
  const files = await collectFiles(PUBLIC_DIR);
  const candidates = [];

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const size = await fileSize(filePath);
    if (size < MIN_SIZE_BYTES) continue;

    candidates.push({ filePath, ext, size });
  }

  if (candidates.length === 0) {
    console.log('No large image candidates found in public/.');
    return;
  }

  let optimizedOriginals = 0;
  let generatedWebp = 0;
  let savedOriginalBytes = 0;

  for (const item of candidates) {
    try {
      const fileName = path.basename(item.filePath);
      const sourceSize = item.size;
      const metadata = await sharp(item.filePath, { failOn: 'none' }).metadata();
      const needsResize =
        Boolean(metadata.width && metadata.height) &&
        Math.max(metadata.width, metadata.height) > MAX_DIMENSION &&
        !fileName.toLowerCase().includes('-share');

      const resizeOptions = needsResize
        ? { width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true }
        : null;

      const optimizedBuffer = await optimizeOriginal(item.filePath, item.ext, resizeOptions);
      if (optimizedBuffer.length < sourceSize * 0.98) {
        const wroteOriginal = await writeFileSafely(item.filePath, optimizedBuffer);
        if (wroteOriginal) {
          optimizedOriginals += 1;
          savedOriginalBytes += sourceSize - optimizedBuffer.length;
          console.log(
            `[orig] ${toRelative(item.filePath)} ${formatMB(sourceSize)} -> ${formatMB(optimizedBuffer.length)}`
          );
        }
      }

      if (shouldGenerateWebp(fileName)) {
        const webpPath = item.filePath.replace(/\.(png|jpe?g)$/i, '.webp');
        const webpBuffer = await optimizeToWebp(item.filePath, resizeOptions);
        const existingWebpSize = await fileSize(webpPath).catch(() => null);
        const shouldWriteWebp =
          existingWebpSize === null || webpBuffer.length < existingWebpSize * 0.98;

        if (shouldWriteWebp) {
          const wroteWebp = await writeFileSafely(webpPath, webpBuffer);
          if (wroteWebp) {
            generatedWebp += 1;
            console.log(
              `[webp] ${toRelative(webpPath)} ${existingWebpSize ? formatMB(existingWebpSize) : 'new'} -> ${formatMB(webpBuffer.length)}`
            );
          }
        }
      }
    } catch (error) {
      console.warn(`[warn] Skipped ${toRelative(item.filePath)}: ${error.message}`);
    }
  }

  console.log('\nImage optimization summary');
  console.log(`- Mode: ${DRY_RUN ? 'dry-run' : 'write'}`);
  console.log(`- Candidates scanned: ${candidates.length}`);
  console.log(`- Originals optimized: ${optimizedOriginals}`);
  console.log(`- WebP files generated/updated: ${generatedWebp}`);
  console.log(`- Original bytes saved: ${formatMB(savedOriginalBytes)}`);
}

main().catch((error) => {
  console.error('Image optimization failed:', error);
  process.exit(1);
});
