import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Helper to load .env / .env.local
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const envPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const serviceKeyArg = args.find(a => a.startsWith('--service-key='))?.split('=')[1];

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = serviceKeyArg || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL) {
  console.error('[Error] VITE_SUPABASE_URL not found in environment.');
  process.exit(1);
}

const supabaseKey = SERVICE_KEY || SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, supabaseKey);

export function toCloudinaryBmpThumbnailUrl(url: string): string {
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return url;
  const baseUrl = url.substring(0, uploadIdx + 8);
  let rest = url.substring(uploadIdx + 8);

  const versionMatch = rest.match(/(v\d+\/.*)/);
  if (versionMatch) {
    rest = versionMatch[1];
  }

  const lastDot = rest.lastIndexOf('.');
  if (lastDot !== -1) {
    rest = rest.substring(0, lastDot) + '.bmp';
  } else {
    rest = rest + '.bmp';
  }

  return `${baseUrl}w_9,h_8,c_scale/${rest}`;
}

export function parseBmpToLumaGrid(buffer: Uint8Array): number[] {
  const offset = buffer[10] | (buffer[11] << 8) | (buffer[12] << 16) | (buffer[13] << 24);
  const width = buffer[18] | (buffer[19] << 8) | (buffer[20] << 16) | (buffer[21] << 24);
  const heightRaw = (buffer[22] | (buffer[23] << 8) | (buffer[24] << 16) | (buffer[25] << 24)) >> 0;
  const height = Math.abs(heightRaw);
  const isBottomUp = heightRaw > 0;
  const bpp = buffer[28] | (buffer[29] << 8);

  const bytesPerPixel = Math.max(1, Math.floor(bpp / 8));
  const rowStride = Math.ceil((width * bytesPerPixel) / 4) * 4;

  const lumaGrid: number[] = new Array(width * height);

  for (let r = 0; r < height; r++) {
    const targetRow = isBottomUp ? height - 1 - r : r;
    const rowStart = offset + r * rowStride;

    for (let c = 0; c < width; c++) {
      const pixelStart = rowStart + c * bytesPerPixel;
      const b = buffer[pixelStart] || 0;
      const g = buffer[pixelStart + 1] || 0;
      const r_val = buffer[pixelStart + 2] || 0;

      // Rec. 601 luma matching imageOptimizer.ts
      const luma = 0.299 * r_val + 0.587 * g + 0.114 * b;
      lumaGrid[targetRow * width + c] = luma;
    }
  }

  return lumaGrid;
}

export function computeDHashFromLumaGrid(lums: number[]): string {
  let hexResult = '';
  let nibble = 0;
  let bitCount = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const leftIdx = row * 9 + col;
      const rightIdx = leftIdx + 1;
      const bit = lums[leftIdx] > lums[rightIdx] ? 1 : 0;

      nibble = (nibble << 1) | bit;
      bitCount++;

      if (bitCount === 4) {
        hexResult += nibble.toString(16);
        nibble = 0;
        bitCount = 0;
      }
    }
  }

  return hexResult.padStart(16, '0');
}

async function fetchImageDHash(cloudinaryUrl: string): Promise<string | null> {
  try {
    const bmpUrl = toCloudinaryBmpThumbnailUrl(cloudinaryUrl);
    const res = await fetch(bmpUrl);
    if (!res.ok) {
      console.warn(`[Warn] Failed to fetch 9x8 BMP from ${bmpUrl} (HTTP ${res.status})`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const lumaGrid = parseBmpToLumaGrid(bytes);
    return computeDHashFromLumaGrid(lumaGrid);
  } catch (err: any) {
    console.warn(`[Warn] Error processing dHash for ${cloudinaryUrl}:`, err.message);
    return null;
  }
}

function extractCloudinaryUrls(obj: any, collected: Set<string>) {
  if (!obj) return;
  if (typeof obj === 'string') {
    if (obj.startsWith('https://res.cloudinary.com/') && obj.includes('/upload/')) {
      const clean = obj.trim().replace(/^["']|["']$/g, '');
      if (clean.length > 35 && /\.(?:jpe?g|png|webp|avif|gif)/i.test(clean)) {
        collected.add(clean);
      }
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractCloudinaryUrls(item, collected);
    }
    return;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      extractCloudinaryUrls(obj[key], collected);
    }
  }
}

async function main() {
  console.log('--- RecipeDB Existing Cloudinary Media Migration ---');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (read-only)' : 'EXECUTE (writing to media_assets)'}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  // 1. Collect all Cloudinary URLs from recipes
  const { data: recipes, error: recipesErr } = await supabase
    .from('recipes')
    .select('id, title, image_url');

  if (recipesErr) {
    console.error('[Error] Failed to fetch recipes:', recipesErr);
    process.exit(1);
  }

  const { data: details, error: detailsErr } = await supabase
    .from('recipe_details')
    .select('recipe_id, sections_ast, raw_fablang');

  if (detailsErr) {
    console.error('[Error] Failed to fetch recipe_details:', detailsErr);
    process.exit(1);
  }

  const uniqueUrls = new Set<string>();

  for (const r of recipes || []) {
    extractCloudinaryUrls(r.image_url, uniqueUrls);
  }

  for (const d of details || []) {
    extractCloudinaryUrls(d.sections_ast, uniqueUrls);
    if (d.raw_fablang) {
      const fablangMatches = d.raw_fablang.match(/https:\/\/res\.cloudinary\.com\/[^\s"',\\]+?\.(?:jpe?g|png|webp|avif|gif)/gi) || [];
      for (const m of fablangMatches) {
        uniqueUrls.add(m);
      }
    }
  }

  const localRecipesDir = path.resolve(process.cwd(), 'src/recipes');
  if (fs.existsSync(localRecipesDir)) {
    const files = fs.readdirSync(localRecipesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(localRecipesDir, file), 'utf8'));
          extractCloudinaryUrls(content, uniqueUrls);
        } catch {}
      }
    }
  }

  console.log(`Discovered ${uniqueUrls.size} unique Cloudinary media assets across database.`);

  const results: Array<{ phash: string; cloudinary_url: string }> = [];
  let processed = 0;

  for (const url of uniqueUrls) {
    processed++;
    process.stdout.write(`[${processed}/${uniqueUrls.size}] Processing: ${url.slice(0, 70)}... `);

    const phash = await fetchImageDHash(url);
    if (!phash) {
      console.log('FAILED');
      continue;
    }

    console.log(`-> dHash: ${phash}`);
    results.push({ phash, cloudinary_url: url });
  }

  console.log(`\nSuccessfully computed hashes for ${results.length} images.`);

  if (isDryRun) {
    console.log('[Dry-Run] Skipped writing to public.media_assets.');
    return;
  }

  // 2. Insert into public.media_assets
  console.log('Inserting records into public.media_assets...');
  let inserted = 0;
  for (const item of results) {
    const { error: insertErr } = await supabase
      .from('media_assets')
      .upsert(
        {
          phash: item.phash,
          cloudinary_url: item.cloudinary_url,
          created_at: new Date().toISOString()
        },
        { onConflict: 'phash', ignoreDuplicates: true }
      );

    if (insertErr) {
      console.warn(`[Warn] Insert failed for hash ${item.phash}:`, insertErr.message);
    } else {
      inserted++;
    }
  }

  console.log(`\nMigration Complete: ${inserted} assets recorded into public.media_assets.`);
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
