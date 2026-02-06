/**
 * CLOUDFLARE WORKER - CONSCRIBO API PROXY
 *
 * Deployed as a separate Worker so that Conscribo credentials
 * (stored as encrypted secrets) are never exposed to the frontend
 * or to the Astro SSR bundle.
 *
 * Allowed actions:
 *   - lookupMember   { identifier }
 *   - createInvoice  { memberIdentifier, items[] }
 *
 * All other Conscribo operations (debug, KV, etc.) can be added later.
 */

const CONSCRIBO_API_URL = "https://secure.conscribo.nl/tskvspartacus/request.json";
const API_VERSION = "0.20161212";

// ── Session cache (in-memory, per-isolate) ──────────────────────────
let cachedSession = { sessionId: null, expiresAt: 0 };

// ── Allowed origins – add your production domain(s) here ────────────
const ALLOWED_ORIGINS = [
  "https://tskvspartacus.nl",
  "https://www.tskvspartacus.nl",
  "http://localhost:4321",        // Astro dev
  "http://localhost:8788",        // wrangler dev
];

// ── Helpers ─────────────────────────────────────────────────────────

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function error(code, message, status = 400, origin = "") {
  return json({ success: false, error: { code, message } }, status, origin);
}

function extractCollection(obj, containerKey, itemKey) {
  if (!obj || typeof obj !== "object") return [];
  const ck = Object.keys(obj).find((k) => k.toLowerCase() === containerKey.toLowerCase());
  const container = ck ? obj[ck] : null;
  if (!container) return [];
  if (Array.isArray(container)) return container;
  if (typeof container === "object") {
    const ik = Object.keys(container).find((k) => k.toLowerCase() === itemKey.toLowerCase());
    const items = ik ? container[ik] : null;
    if (items) return Array.isArray(items) ? items : [items];
    const vals = Object.values(container);
    if (vals.length === 1 && (Array.isArray(vals[0]) || typeof vals[0] === "object")) {
      return Array.isArray(vals[0]) ? vals[0] : [vals[0]];
    }
  }
  return [container];
}

async function conscriboRequest(payload, sessionId = null) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Conscribo-API-Version": API_VERSION,
  };
  if (sessionId) headers["X-Conscribo-SessionId"] = sessionId;

  const res = await fetch(CONSCRIBO_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  const rk = Object.keys(data).find(
    (k) => k.toLowerCase() === "result" || k.toLowerCase() === "results"
  );
  const result = rk ? data[rk] : data;
  return Array.isArray(result) ? result[0] : result;
}

async function getSession(env) {
  const now = Date.now();
  if (cachedSession.sessionId && cachedSession.expiresAt > now + 5 * 60 * 1000) {
    return cachedSession.sessionId;
  }

  const data = await conscriboRequest({
    request: {
      command: "authenticateWithUserAndPass",
      userName: env.CONSCRIBO_USER,
      passPhrase: env.CONSCRIBO_PASS,
    },
  });

  if (data && data.success === 1) {
    cachedSession = { sessionId: data.sessionId, expiresAt: now + 25 * 60 * 1000 };
    return cachedSession.sessionId;
  }
  throw new Error("Conscribo authentication failed");
}

async function lookupMember(sessionId, identifier) {
  const isEmail = identifier.includes("@");
  const fields = { code: "code", firstName: "voornaam", lastName: "naam", email: "email" };

  const data = await conscriboRequest(
    {
      request: {
        command: "listRelations",
        entityType: "persoon",
        requestedFields: { fieldName: Object.values(fields) },
        filters: {
          filter: isEmail
            ? { fieldName: fields.email, operator: "=", value: identifier }
            : { fieldName: fields.code, operator: "=", value: identifier },
        },
        limit: 1,
      },
    },
    sessionId
  );

  const relations = extractCollection(data, "Relations", "relation");
  if (relations.length === 0) return null;

  const r = relations[0];
  return {
    code: r[fields.code] || "",
    voornaam: r[fields.firstName] || "",
    achternaam: r[fields.lastName] || "",
    email: r[fields.email] || "",
    fullName: `${r[fields.firstName] || ""} ${r[fields.lastName] || ""}`.trim(),
  };
}

// ── Action handlers ─────────────────────────────────────────────────

async function handleLookupMember(body, env, origin) {
  if (!body.identifier) return error("INVALID_INPUT", "Missing identifier", 400, origin);

  const sessionId = await getSession(env);
  const member = await lookupMember(sessionId, body.identifier);
  if (!member) return error("MEMBER_NOT_FOUND", "Lid niet gevonden", 404, origin);

  return json({ success: true, member }, 200, origin);
}

async function handleCreateInvoice(body, env, origin) {
  const { memberIdentifier, items } = body;

  if (!memberIdentifier || !Array.isArray(items) || items.length === 0) {
    return error("INVALID_INPUT", "Missing memberIdentifier or items", 400, origin);
  }

  // Validate item shape
  for (const item of items) {
    if (!item.name || typeof item.price !== "number" || typeof item.quantity !== "number" || item.quantity < 1) {
      return error("INVALID_INPUT", "Each item needs name, price (number), quantity (number >= 1)", 400, origin);
    }
  }

  const sessionId = await getSession(env);

  const member = await lookupMember(sessionId, memberIdentifier);
  if (!member) {
    return error("MEMBER_NOT_FOUND", "Member not found. Use your registered email or member code.", 404, origin);
  }

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalFormatted = total.toFixed(2).replace(".", ",");

  const lineDescriptions = items
    .map((i) => `${i.quantity}x ${i.name} @ \u20AC${i.price.toFixed(2)}`)
    .join(", ");

  const description = `Webshop order - ${member.fullName} (${member.code})\n${lineDescriptions}`;
  const today = new Date().toISOString().split("T")[0];

  const result = await conscriboRequest(
    {
      request: {
        command: "addChangeTransaction",
        transaction: {
          description,
          date: today,
          transactionRows: {
            transactionRow: [
              { amount: totalFormatted, side: "debet", accountNr: "1300", reference: member.code },
              { amount: totalFormatted, side: "credit", accountNr: "8000", reference: `Webshop: ${lineDescriptions}` },
            ],
          },
        },
      },
    },
    sessionId
  );

  if (result && (result.success === 1 || result.transactionId)) {
    return json(
      {
        success: true,
        message: "Order placed! An invoice has been created and will be sent to your email.",
        transactionId: result.transactionId || null,
        member: { name: member.fullName, email: member.email },
        total: `\u20AC${total.toFixed(2)}`,
      },
      200,
      origin
    );
  }

  return error("CONSCRIBO_ERROR", "Failed to create invoice. Please try again or contact the board.", 500, origin);
}

// ── Main handler ────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return error("METHOD_NOT_ALLOWED", "Use POST", 405, origin);
    }

    // Verify shared API key
    const apiKey = request.headers.get("X-API-Key");
    if (!env.PROXY_API_KEY || apiKey !== env.PROXY_API_KEY) {
      return error("UNAUTHORIZED", "Invalid or missing API key", 401, origin);
    }

    try {
      const body = await request.json();

      switch (body.action) {
        case "lookupMember":
          return await handleLookupMember(body, env, origin);
        case "createInvoice":
          return await handleCreateInvoice(body, env, origin);
        default:
          return error("UNKNOWN_ACTION", `Unknown action: ${body.action}`, 400, origin);
      }
    } catch (err) {
      return error("SERVER_ERROR", err.message, 500, origin);
    }
  },
};
