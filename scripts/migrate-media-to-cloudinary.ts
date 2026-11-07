import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Helper to parse .env file
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
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

loadEnv();

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const serviceKeyArg = args.find(a => a.startsWith('--service-key='))?.split('=')[1];
const adminEmailArg = args.find(a => a.startsWith('--email='))?.split('=')[1];
const adminPasswordArg = args.find(a => a.startsWith('--password='))?.split('=')[1];

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = serviceKeyArg || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CLOUD_NAME = process.env.VITE_CLOUDINARY_CLOUD_NAME || '';
const UPLOAD_PRESET = process.env.VITE_CLOUDINARY_UPLOAD_PRESET || '';
const API_KEY = process.env.VITE_CLOUDINARY_API_KEY || '';

if (!SUPABASE_URL) {
  console.error('[Error] VITE_SUPABASE_URL not found in environment.');
  process.exit(1);
}

if (!CLOUD_NAME || !UPLOAD_PRESET) {
  console.error('[Error] Cloudinary configuration missing (VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET).');
  process.exit(1);
}

const supabaseKey = SERVICE_KEY || SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, supabaseKey);

function isCandidateImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (trimmed.includes('cloudinary.com')) return false;
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) return false;
  return true;
}

async function uploadToCloudinary(sourceUrl: string): Promise<string | null> {
  try {
    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
    const form = new FormData();
    form.append('file', sourceUrl);
    form.append('upload_preset', UPLOAD_PRESET);
    if (API_KEY) {
      form.append('api_key', API_KEY);
    }
    form.append('folder', 'recipes/images');

    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: form
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`  [Cloudinary] Upload failed for ${sourceUrl}: HTTP ${res.status} ${errText}`);
      return null;
    }

    const data = await res.json();
    return data.secure_url || null;
  } catch (err: any) {
    console.warn(`  [Cloudinary] Network error for ${sourceUrl}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('--- RecipeDB Cloudinary Media Migration ---');
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (no database writes)' : 'EXECUTE'}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Cloudinary Cloud: ${CLOUD_NAME}`);
  console.log(`Using Service Key: ${!!SERVICE_KEY}`);

  if (!SERVICE_KEY && adminEmailArg && adminPasswordArg) {
    console.log(`Signing in as admin: ${adminEmailArg}...`);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: adminEmailArg,
      password: adminPasswordArg
    });
    if (signInErr) {
      console.error(`[Error] Admin sign-in failed: ${signInErr.message}`);
      process.exit(1);
    }
    console.log('Admin session authenticated.');
  }

  // 1. Fetch all recipes
  const { data: recipes, error: recipesErr } = await supabase
    .from('recipes')
    .select('id, slug, title, image_url, status');

  if (recipesErr || !recipes) {
    console.error(`[Error] Failed to fetch recipes:`, recipesErr?.message);
    process.exit(1);
  }

  console.log(`\nFound ${recipes.length} total recipe(s) to inspect.\n`);

  let scannedCount = 0;
  let updatedRecipesCount = 0;
  let uploadedImagesCount = 0;
  let failedImagesCount = 0;

  const urlCache = new Map<string, string>();

  for (const recipe of recipes) {
    scannedCount++;
    console.log(`[${scannedCount}/${recipes.length}] Checking "${recipe.title}" (${recipe.slug})...`);

    let recipeUpdated = false;
    let newHeroUrl = recipe.image_url;

    // A. Check hero image
    if (recipe.image_url && isCandidateImage(recipe.image_url)) {
      console.log(`  Found external hero image: ${recipe.image_url}`);
      let cloudUrl = urlCache.get(recipe.image_url);
      if (!cloudUrl) {
        if (isDryRun) {
          cloudUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v1/recipes/images/dry_run_mock.jpg`;
          console.log(`  [DRY RUN] Would upload: ${recipe.image_url} -> ${cloudUrl}`);
        } else {
          cloudUrl = (await uploadToCloudinary(recipe.image_url)) || undefined;
          if (cloudUrl) {
            console.log(`  Uploaded to Cloudinary: ${cloudUrl}`);
            uploadedImagesCount++;
            urlCache.set(recipe.image_url, cloudUrl);
          } else {
            failedImagesCount++;
          }
        }
      }

      if (cloudUrl) {
        newHeroUrl = cloudUrl;
        recipeUpdated = true;
      }
    }

    // B. Check recipe_details.sections_ast
    const { data: details, error: detailsErr } = await supabase
      .from('recipe_details')
      .select('recipe_id, sections_ast')
      .eq('recipe_id', recipe.id)
      .maybeSingle();

    let newSectionsAst = details?.sections_ast;
    let detailsChanged = false;

    if (details && details.sections_ast) {
      let astJson = JSON.stringify(details.sections_ast);
      const urlRegex = /"(https?:\/\/[^"\\]+?\.(?:png|jpe?g|webp|gif|avif|jxl|svg)(?:\?[^"\\]*)?)"/gi;
      const matches = [...astJson.matchAll(urlRegex)];

      const candidateUrls = new Set<string>();
      for (const m of matches) {
        if (isCandidateImage(m[1])) {
          candidateUrls.add(m[1]);
        }
      }

      if (candidateUrls.size > 0) {
        console.log(`  Found ${candidateUrls.size} external image(s) in sections_ast`);
        for (const rawUrl of candidateUrls) {
          let cloudUrl = urlCache.get(rawUrl);
          if (!cloudUrl) {
            if (isDryRun) {
              cloudUrl = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v1/recipes/images/dry_run_mock.jpg`;
              console.log(`  [DRY RUN] Would upload in AST: ${rawUrl} -> ${cloudUrl}`);
            } else {
              cloudUrl = (await uploadToCloudinary(rawUrl)) || undefined;
              if (cloudUrl) {
                console.log(`  Uploaded AST image: ${cloudUrl}`);
                uploadedImagesCount++;
                urlCache.set(rawUrl, cloudUrl);
              } else {
                failedImagesCount++;
              }
            }
          }

          if (cloudUrl) {
            astJson = astJson.split(`"${rawUrl}"`).join(`"${cloudUrl}"`);
            detailsChanged = true;
          }
        }

        if (detailsChanged) {
          newSectionsAst = JSON.parse(astJson);
          recipeUpdated = true;
        }
      }
    }

    // C. Persist updates if not in dry-run
    if (recipeUpdated) {
      updatedRecipesCount++;
      if (!isDryRun) {
        if (newHeroUrl !== recipe.image_url) {
          const { error: upHeroErr } = await supabase
            .from('recipes')
            .update({ image_url: newHeroUrl })
            .eq('id', recipe.id);

          if (upHeroErr) {
            console.error(`  [DB Error] Failed to update recipes.image_url: ${upHeroErr.message}`);
          }
        }

        if (detailsChanged && newSectionsAst) {
          const { error: upDetErr } = await supabase
            .from('recipe_details')
            .update({ sections_ast: newSectionsAst })
            .eq('recipe_id', recipe.id);

          if (upDetErr) {
            console.error(`  [DB Error] Failed to update recipe_details: ${upDetErr.message}`);
          }
        }
        console.log(`  -> Successfully updated "${recipe.title}" in Supabase.`);
      } else {
        console.log(`  -> [DRY RUN] Marked "${recipe.title}" as modified.`);
      }
    } else {
      console.log(`  Already using Cloudinary / no external images found.`);
    }
  }

  console.log('\n================ SUMMARY ================');
  console.log(`Total recipes checked : ${scannedCount}`);
  console.log(`Recipes with updates  : ${updatedRecipesCount}`);
  console.log(`Images uploaded       : ${uploadedImagesCount}`);
  console.log(`Images failed         : ${failedImagesCount}`);
  console.log('=========================================\n');
}

main().catch(err => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
