interface Env {
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
  CLOUDINARY_CLOUD_NAME?: string;
  [key: string]: string | undefined;
}

interface RequestContext {
  request: Request;
  env: Env;
}

async function sha1(str: string): Promise<string> {
  const enc = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', enc);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const ALLOWED_FOLDERS = new Set(['recipes/images', 'recipes/videos']);

export async function onRequestPost(context: RequestContext): Promise<Response> {
  const { request, env } = context;

  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  const cloudName = env.CLOUDINARY_CLOUD_NAME;

  if (!apiKey || !apiSecret || !cloudName) {
    return new Response(
      JSON.stringify({
        error: 'Cloudinary signing credentials not configured in Cloudflare environment'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ error: 'Content-Type must be application/json' }),
        { status: 415, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = (await request.json()) as { folder?: string };
    const folder = body?.folder;

    if (!folder || !ALLOWED_FOLDERS.has(folder)) {
      return new Response(
        JSON.stringify({
          error: `Invalid or disallowed folder. Allowed: ${Array.from(ALLOWED_FOLDERS).join(', ')}`
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary signature string format: sorted key=value pairs joined with &, followed by api_secret
    const serializedParams = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = await sha1(serializedParams);

    return new Response(
      JSON.stringify({
        signature,
        timestamp,
        apiKey,
        cloudName,
        folder
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal signing error';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}
