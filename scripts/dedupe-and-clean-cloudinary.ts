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
const isExecute = args.includes('--execute');
const isDryRun = !isExecute || args.includes('--dry-run');
const shouldDeleteCloudinary = args.includes('--delete-cloudinary');
const serviceKeyArg = args.find(a => a.startsWith('--service-key='))?.split('=')[1];
const adminEmailArg = args.find(a => a.startsWith('--email='))?.split('=')[1];
const adminPasswordArg = args.find(a => a.startsWith('--password='))?.split('=')[1];
const thresholdArg = args.find(a => a.startsWith('--threshold='))?.split('=')[1];
const arToleranceArg = args.find(a => a.startsWith('--ar-tolerance='))?.split('=')[1];

const HAMMING_THRESHOLD = thresholdArg ? parseInt(thresholdArg, 10) : 8;
const AR_TOLERANCE = arToleranceArg ? parseFloat(arToleranceArg) : 0.02;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = serviceKeyArg || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CLOUD_NAME = process.env.VITE_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.VITE_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

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

  return `${baseUrl}w_17,h_16,c_scale/${rest}`;
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

  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const leftIdx = row * 17 + col;
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

  return hexResult.padStart(64, '0');
}

export function computeHammingDistance(hexA: string, hexB: string): number {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 256;
  let distance = 0;
  for (let i = 0; i < hexA.length; i++) {
    const valA = parseInt(hexA[i], 16);
    const valB = parseInt(hexB[i], 16);
    if (isNaN(valA) || isNaN(valB)) return 256;
    let xor = valA ^ valB;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export function extractCloudinaryPublicId(url: string): string | null {
  const uploadIdx = url.indexOf('/upload/');
  if (uploadIdx === -1) return null;
  let rest = url.substring(uploadIdx + 8);

  // Strip transform segment if present
  const firstSlashIdx = rest.indexOf('/');
  if (firstSlashIdx !== -1) {
    const firstSegment = rest.slice(0, firstSlashIdx);
    if (!firstSegment.startsWith('v') || isNaN(Number(firstSegment.slice(1)))) {
      rest = rest.slice(firstSlashIdx + 1);
    }
  }

  // Strip version segment if present
  const versionMatch = rest.match(/^v\d+\/(.*)$/);
  if (versionMatch) {
    rest = versionMatch[1];
  }

  // Strip file extension
  const dotIdx = rest.lastIndexOf('.');
  if (dotIdx !== -1) {
    rest = rest.substring(0, dotIdx);
  }

  return rest;
}

interface ImageMetadata {
  rawUrl: string;
  publicId: string;
  phash: string;
  aspectRatio: number;
}

async function fetchImageFingerprint(cloudinaryUrl: string): Promise<{ phash: string; aspectRatio: number } | null> {
  try {
    const bmpUrl = toCloudinaryBmpThumbnailUrl(cloudinaryUrl);
    const res = await fetch(bmpUrl);
    if (!res.ok) {
      console.warn(`[Warn] Failed to fetch 17x16 BMP from ${bmpUrl} (HTTP ${res.status})`);
      return null;
    }

    let aspectRatio = 1.0;
    const serverTiming = res.headers.get('server-timing') || '';
    const matchOw = serverTiming.match(/owidth=(\d+)/);
    const matchOh = serverTiming.match(/oheight=(\d+)/);
    if (matchOw && matchOh) {
      const ow = parseInt(matchOw[1], 10);
      const oh = parseInt(matchOh[1], 10);
      if (ow > 0 && oh > 0) {
        aspectRatio = Number((ow / oh).toFixed(3));
      }
    }

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const lumaGrid = parseBmpToLumaGrid(bytes);
    const phash = computeDHashFromLumaGrid(lumaGrid);
    return { phash, aspectRatio };
  } catch (err: any) {
    console.warn(`[Warn] Error processing 256-bit dHash for ${cloudinaryUrl}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('=== RecipeDB Perceptual Media Deduplication & Cleanup Tool ===');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (audit only, no changes written)' : 'EXECUTE (writing database updates)'}`);
  console.log(`Hamming Distance Threshold: <= ${HAMMING_THRESHOLD} bits`);
  console.log(`Aspect Ratio Guard Tolerance: <= ${(AR_TOLERANCE * 100).toFixed(1)}%`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Service Role Active: ${!!SERVICE_KEY}`);

  if (!SERVICE_KEY && adminEmailArg && adminPasswordArg) {
    console.log(`Signing in as admin/owner: ${adminEmailArg}...`);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: adminEmailArg,
      password: adminPasswordArg
    });
    if (signInErr) {
      console.error(`[Error] Admin sign-in failed: ${signInErr.message}`);
      process.exit(1);
    }
    console.log('Authenticated session active.\n');
  } else {
    console.log('');
  }

  // 1. Fetch all recipes
  const { data: recipes, error: recipesErr } = await supabase
    .from('recipes')
    .select('id, title, slug, image_url');

  if (recipesErr || !recipes) {
    console.error('[Error] Failed to fetch recipes:', recipesErr?.message);
    process.exit(1);
  }

  // 2. Fetch all recipe_details
  const { data: detailsList, error: detailsErr } = await supabase
    .from('recipe_details')
    .select('recipe_id, sections_ast, raw_fablang');

  if (detailsErr || !detailsList) {
    console.error('[Error] Failed to fetch recipe_details:', detailsErr?.message);
    process.exit(1);
  }

  console.log(`Loaded ${recipes.length} recipe(s) and ${detailsList.length} recipe_detail record(s).`);

  // 3. Extract unique Cloudinary URLs and tally their references
  const urlReferenceCounts = new Map<string, number>();
  const addUrlRef = (url: string) => {
    if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return;
    urlReferenceCounts.set(url, (urlReferenceCounts.get(url) || 0) + 1);
  };

  for (const recipe of recipes) {
    if (recipe.image_url) addUrlRef(recipe.image_url);
  }

  const cloudinaryUrlRegex = /https:\/\/res\.cloudinary\.com\/[^"\n\s\)]+/g;

  for (const details of detailsList) {
    if (details.raw_fablang) {
      const matches = details.raw_fablang.match(cloudinaryUrlRegex) || [];
      for (const m of matches) addUrlRef(m);
    }
    if (details.sections_ast) {
      const astStr = JSON.stringify(details.sections_ast);
      const matches = astStr.match(cloudinaryUrlRegex) || [];
      for (const m of matches) addUrlRef(m);
    }
  }

  // Also include any URLs in media_assets table
  const { data: mediaRows } = await supabase
    .from('media_assets')
    .select('cloudinary_url, phash, aspect_ratio');

  if (mediaRows) {
    for (const row of mediaRows) {
      if (row.cloudinary_url) addUrlRef(row.cloudinary_url);
    }
  }

  const uniqueUrls = Array.from(urlReferenceCounts.keys());
  console.log(`Discovered ${uniqueUrls.length} distinct Cloudinary URL(s) referenced across database.\n`);

  // 4. Fetch/compute fingerprints for all unique URLs
  console.log('Computing 256-bit dHash fingerprints...');
  const knownAssets: ImageMetadata[] = [];
  let processed = 0;

  for (const url of uniqueUrls) {
    processed++;
    const publicId = extractCloudinaryPublicId(url) || url;
    process.stdout.write(`[${processed}/${uniqueUrls.length}] Fingerprinting: ${publicId}... `);

    // Check if we already have it in media_assets
    const existingRow = mediaRows?.find(r => r.cloudinary_url === url);
    if (existingRow && existingRow.phash && existingRow.phash.length === 64) {
      knownAssets.push({
        rawUrl: url,
        publicId,
        phash: existingRow.phash,
        aspectRatio: typeof existingRow.aspect_ratio === 'number' ? existingRow.aspect_ratio : 1.0
      });
      console.log('CACHED');
      continue;
    }

    const fp = await fetchImageFingerprint(url);
    if (!fp) {
      console.log('FAILED');
      continue;
    }

    knownAssets.push({
      rawUrl: url,
      publicId,
      phash: fp.phash,
      aspectRatio: fp.aspectRatio
    });
    console.log(`OK (Hash: ${fp.phash.slice(0, 12)}..., AR: ${fp.aspectRatio})`);
  }

  console.log(`\nSuccessfully fingerprinted ${knownAssets.length} image asset(s).\n`);

  // 5. Cluster visually duplicate assets
  // Using disjoint-set / union-find
  const parent = new Map<string, string>();
  const findRoot = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id);
    if (parent.get(id) !== id) {
      parent.set(id, findRoot(parent.get(id)!));
    }
    return parent.get(id)!;
  };

  const union = (idA: string, idB: string) => {
    const rootA = findRoot(idA);
    const rootB = findRoot(idB);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  };

  for (let i = 0; i < knownAssets.length; i++) {
    for (let j = i + 1; j < knownAssets.length; j++) {
      const a = knownAssets[i];
      const b = knownAssets[j];

      // Exact publicId match
      if (a.publicId === b.publicId) {
        union(a.rawUrl, b.rawUrl);
        continue;
      }

      // Aspect ratio guard
      const arDiff = Math.abs(a.aspectRatio - b.aspectRatio) / a.aspectRatio;
      if (arDiff > AR_TOLERANCE) {
        continue;
      }

      // Hamming distance check
      const dist = computeHammingDistance(a.phash, b.phash);
      if (dist <= HAMMING_THRESHOLD) {
        union(a.rawUrl, b.rawUrl);
      }
    }
  }

  // Group by cluster root
  const clusters = new Map<string, ImageMetadata[]>();
  for (const asset of knownAssets) {
    const root = findRoot(asset.rawUrl);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(asset);
  }

  const duplicateClusters = Array.from(clusters.values()).filter(c => c.length > 1);
  console.log(`Found ${duplicateClusters.length} duplicate cluster(s) among assets.\n`);

  if (duplicateClusters.length === 0) {
    console.log('No duplicate Cloudinary images detected. System is clean!');
    return;
  }

  // 6. Select canonical asset for each cluster and build replacement map
  const replacementMap = new Map<string, string>();
  const redundantPublicIds = new Set<string>();

  duplicateClusters.forEach((cluster, idx) => {
    console.log(`--- Duplicate Cluster #${idx + 1} (${cluster.length} variants) ---`);

    // Choose canonical URL: highest reference count, or first
    cluster.sort((a, b) => {
      const countA = urlReferenceCounts.get(a.rawUrl) || 0;
      const countB = urlReferenceCounts.get(b.rawUrl) || 0;
      return countB - countA;
    });

    const canonical = cluster[0];
    console.log(`  [Canonical]: ${canonical.rawUrl} (${urlReferenceCounts.get(canonical.rawUrl) || 0} refs, AR: ${canonical.aspectRatio})`);

    for (let k = 1; k < cluster.length; k++) {
      const duplicate = cluster[k];
      const dist = computeHammingDistance(canonical.phash, duplicate.phash);
      const arDiff = ((Math.abs(canonical.aspectRatio - duplicate.aspectRatio) / canonical.aspectRatio) * 100).toFixed(1);
      console.log(`  -> [Duplicate]: ${duplicate.rawUrl} (Dist: ${dist} bits, AR Diff: ${arDiff}%, ${urlReferenceCounts.get(duplicate.rawUrl) || 0} refs)`);

      replacementMap.set(duplicate.rawUrl, canonical.rawUrl);

      // If it's a completely different public ID in Cloudinary, mark for deletion
      if (duplicate.publicId !== canonical.publicId) {
        redundantPublicIds.add(duplicate.publicId);
      }
    }
    console.log('');
  });

  console.log(`Total URLs to remap: ${replacementMap.size}`);
  console.log(`Redundant Cloudinary public IDs: ${redundantPublicIds.size}\n`);

  if (isDryRun) {
    console.log('[DRY-RUN Complete] No database records modified.');
    console.log('To apply these remappings to Supabase, run with: --execute');
    return;
  }

  // 7. Apply updates to Supabase
  console.log('--- Applying Remappings to Supabase ---');
  let recipesUpdated = 0;
  for (const recipe of recipes) {
    if (recipe.image_url && replacementMap.has(recipe.image_url)) {
      const canonicalUrl = replacementMap.get(recipe.image_url)!;
      console.log(`Updating recipe "${recipe.title}" (${recipe.id}): image_url -> canonical`);
      const { error } = await supabase
        .from('recipes')
        .update({ image_url: canonicalUrl })
        .eq('id', recipe.id);

      if (error) {
        console.warn(`[Error] Failed updating recipe ${recipe.id}:`, error.message);
      } else {
        recipesUpdated++;
      }
    }
  }

  let detailsUpdated = 0;
  for (const details of detailsList) {
    let fablangChanged = false;
    let astChanged = false;

    let updatedFablang = details.raw_fablang;
    let updatedAstJson = JSON.stringify(details.sections_ast);

    for (const [dupUrl, canUrl] of replacementMap.entries()) {
      if (updatedFablang && updatedFablang.includes(dupUrl)) {
        updatedFablang = updatedFablang.split(dupUrl).join(canUrl);
        fablangChanged = true;
      }
      if (updatedAstJson && updatedAstJson.includes(dupUrl)) {
        updatedAstJson = updatedAstJson.split(dupUrl).join(canUrl);
        astChanged = true;
      }
    }

    if (fablangChanged || astChanged) {
      console.log(`Updating recipe_details for recipe ${details.recipe_id}...`);
      const updatePayload: Record<string, any> = {};
      if (fablangChanged) updatePayload.raw_fablang = updatedFablang;
      if (astChanged) updatePayload.sections_ast = JSON.parse(updatedAstJson);

      const { error } = await supabase
        .from('recipe_details')
        .update(updatePayload)
        .eq('recipe_id', details.recipe_id);

      if (error) {
        console.warn(`[Error] Failed updating recipe_details for ${details.recipe_id}:`, error.message);
      } else {
        detailsUpdated++;
      }
    }
  }

  // Update media_assets table
  console.log('Synchronizing public.media_assets table...');
  for (const [dupUrl, canUrl] of replacementMap.entries()) {
    await supabase.from('media_assets').delete().eq('cloudinary_url', dupUrl);
  }

  for (const cluster of duplicateClusters) {
    const canonical = cluster[0];
    await supabase.from('media_assets').upsert(
      {
        phash: canonical.phash,
        cloudinary_url: canonical.rawUrl,
        aspect_ratio: canonical.aspectRatio
      },
      { onConflict: 'phash' }
    );
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Recipes updated: ${recipesUpdated}`);
  console.log(`Recipe Details records updated: ${detailsUpdated}`);

  // 8. Redundant Cloudinary Assets Cleanup
  if (redundantPublicIds.size > 0) {
    console.log(`\nRedundant Cloudinary public IDs identified:`);
    for (const pid of redundantPublicIds) {
      console.log(`  - ${pid}`);
    }

    if (shouldDeleteCloudinary && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
      console.log('\nDeleting redundant assets from Cloudinary...');
      for (const pid of redundantPublicIds) {
        try {
          const timestamp = Math.floor(Date.now() / 1000);
          const crypto = await import('crypto');
          const toSign = `public_id=${pid}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
          const signature = crypto.createHash('sha1').update(toSign).digest('hex');

          const form = new FormData();
          form.append('public_id', pid);
          form.append('api_key', CLOUDINARY_API_KEY);
          form.append('timestamp', String(timestamp));
          form.append('signature', signature);

          const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
            method: 'POST',
            body: form
          });
          const resJson = await res.json();
          console.log(`  [Cloudinary Destroy] ${pid}:`, resJson.result || resJson);
        } catch (delErr: any) {
          console.warn(`  [Cloudinary Destroy Error] ${pid}:`, delErr.message);
        }
      }
    } else {
      console.log('\n[Notice] Cloudinary assets were not deleted.');
      console.log('To automatically delete them, run with: --execute --delete-cloudinary (with CLOUDINARY_API_SECRET configured).');
    }
  }
}

main().catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
