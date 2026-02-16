import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const collectionsDir = path.join(repoRoot, 'collections');
const outputFile = path.join(collectionsDir, 'index.js');

function toIdentifier(fileName) {
  const base = path.basename(fileName, '.js');
  const normalized = base.replace(/[^A-Za-z0-9_$]/g, '_');
  return normalized.match(/^[A-Za-z_$]/) ? normalized : `c_${normalized}`;
}

async function readCollectionMeta(fileName) {
  const fullPath = path.join(collectionsDir, fileName);
  const moduleUrl = `${pathToFileURL(fullPath).href}?v=${Date.now()}`;
  const mod = await import(moduleUrl);
  const collection = mod?.default;

  if (!collection || typeof collection !== 'object') {
    throw new Error(`Default export is not a collection object in ${fileName}`);
  }
  if (!collection.slug || typeof collection.slug !== 'string') {
    throw new Error(`Missing slug in ${fileName}`);
  }

  return {
    fileName,
    identifier: toIdentifier(fileName),
    slug: collection.slug.trim()
  };
}

async function main() {
  const files = fs
    .readdirSync(collectionsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.js'))
    .filter((name) => name !== '_TEMPLATE.js' && name !== 'index.js')
    .sort((a, b) => a.localeCompare(b));

  const metas = [];
  const slugSet = new Set();

  for (const fileName of files) {
    const meta = await readCollectionMeta(fileName);
    if (slugSet.has(meta.slug)) {
      throw new Error(`Duplicate slug "${meta.slug}" found while indexing collections`);
    }
    slugSet.add(meta.slug);
    metas.push(meta);
  }

  metas.sort((a, b) => a.slug.localeCompare(b.slug));

  const imports = metas
    .map((meta) => `import ${meta.identifier} from './${meta.fileName}';`)
    .join('\n');

  const mapLines = metas
    .map((meta) => `  '${meta.slug}': ${meta.identifier},`)
    .join('\n');

  const content = `/**
 * AUTO-GENERATED FILE. DO NOT EDIT.
 * Run: npm run collections:sync
 */

${imports}

export const COLLECTIONS_MAP = {
${mapLines}
};

export default COLLECTIONS_MAP;
`;

  fs.writeFileSync(outputFile, content, 'utf8');
  console.log(`Generated ${path.relative(repoRoot, outputFile)} with ${metas.length} collections.`);
}

main().catch((error) => {
  console.error('[collections:sync] Failed:', error.message);
  process.exit(1);
});
