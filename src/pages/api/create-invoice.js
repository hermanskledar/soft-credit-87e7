/**
 * Thin proxy that forwards checkout requests to the Conscribo proxy worker.
 * No Conscribo credentials live in the Astro codebase.
 *
 * Required environment variables (set in Cloudflare dashboard or .dev.vars):
 *   CONSCRIBO_PROXY_URL  – e.g. https://conscribo-proxy.<your-subdomain>.workers.dev
 *   PROXY_API_KEY        – shared secret matching the proxy worker's PROXY_API_KEY
 */

export async function POST({ request, locals }) {
  const env = locals?.runtime?.env ?? {};

  const PROXY_URL = env.CONSCRIBO_PROXY_URL;
  const API_KEY = env.PROXY_API_KEY;

  if (!PROXY_URL || !API_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Shop backend is not configured. Please contact the board.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { memberIdentifier, items } = body;

    if (!memberIdentifier || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing memberIdentifier or items" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const proxyResponse = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        action: "createInvoice",
        memberIdentifier,
        items,
      }),
    });

    const result = await proxyResponse.json();

    return new Response(JSON.stringify(result), {
      status: proxyResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: "Server error: " + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
