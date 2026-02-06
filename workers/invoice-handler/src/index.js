const CONSCRIBO_API_URL = "https://secure.conscribo.nl/tskvspartacus/request.json";
const API_VERSION = "0.20161212";

const ALLOWED_ORIGINS = [
  "https://tskvspartacus.nl",
  "https://www.tskvspartacus.nl",
  "http://localhost:4321",
];

const SERVICE_ACCOUNT = {
  userName: "API",
  passPhrase: "bes5qRr6FzVi!AK",
};

function corsHeaders(origin) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

async function conscriboRequest(payload, sessionId = null) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Conscribo-API-Version": API_VERSION,
  };
  if (sessionId) headers["X-Conscribo-SessionId"] = sessionId;

  const response = await fetch(CONSCRIBO_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  const rootKey = Object.keys(data).find(
    (k) => k.toLowerCase() === "result" || k.toLowerCase() === "results"
  );
  const result = rootKey ? data[rootKey] : data;
  return Array.isArray(result) ? result[0] : result;
}

async function getSession() {
  const payload = {
    request: {
      command: "authenticateWithUserAndPass",
      userName: SERVICE_ACCOUNT.userName,
      passPhrase: SERVICE_ACCOUNT.passPhrase,
    },
  };

  const data = await conscriboRequest(payload);
  if (data && data.success === 1) {
    return data.sessionId;
  }
  throw new Error("Conscribo authentication failed");
}

function extractCollection(obj, containerKey, itemKey) {
  if (!obj || typeof obj !== "object") return [];
  const actualContainerKey = Object.keys(obj).find(
    (k) => k.toLowerCase() === containerKey.toLowerCase()
  );
  const container = actualContainerKey ? obj[actualContainerKey] : null;
  if (!container) return [];
  if (Array.isArray(container)) return container;
  if (typeof container === "object") {
    const actualItemKey = Object.keys(container).find(
      (k) => k.toLowerCase() === itemKey.toLowerCase()
    );
    const items = actualItemKey ? container[actualItemKey] : null;
    if (items) return Array.isArray(items) ? items : [items];
  }
  return [container];
}

async function lookupMember(sessionId, identifier) {
  const isEmail = identifier.includes("@");
  const fields = {
    code: "code",
    firstName: "voornaam",
    lastName: "naam",
    email: "email",
  };

  const payload = {
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
  };

  const data = await conscriboRequest(payload, sessionId);
  const relations = extractCollection(data, "Relations", "relation");
  if (relations.length === 0) return null;

  const raw = relations[0];
  return {
    code: raw[fields.code] || "",
    voornaam: raw[fields.firstName] || "",
    achternaam: raw[fields.lastName] || "",
    email: raw[fields.email] || "",
    fullName: `${raw[fields.firstName] || ""} ${raw[fields.lastName] || ""}`.trim(),
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, message: "Method not allowed" }),
        { status: 405, headers: corsHeaders(origin) }
      );
    }

    try {
      const body = await request.json();
      const { memberIdentifier, items } = body;

      if (!memberIdentifier || !items || !Array.isArray(items) || items.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Missing memberIdentifier or items",
          }),
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      const sessionId = await getSession();

      const member = await lookupMember(sessionId, memberIdentifier);
      if (!member) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Member not found. Please use your registered email or member code.",
          }),
          { status: 404, headers: corsHeaders(origin) }
        );
      }

      const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const totalFormatted = total.toFixed(2).replace(".", ",");

      const lineDescriptions = items
        .map((item) => `${item.quantity}x ${item.name} @ €${item.price.toFixed(2)}`)
        .join(", ");
      const description = `Webshop order - ${member.fullName} (${member.code})\n${lineDescriptions}`;
      const today = new Date().toISOString().split("T")[0];

      const transactionRows = {
        transactionRow: [
          {
            amount: totalFormatted,
            side: "debet",
            accountNr: "1300",
            reference: member.code,
          },
          {
            amount: totalFormatted,
            side: "credit",
            accountNr: "8000",
            reference: `Webshop: ${lineDescriptions}`,
          },
        ],
      };

      const payload = {
        request: {
          command: "addChangeTransaction",
          transaction: {
            description,
            date: today,
            transactionRows,
          },
        },
      };

      const result = await conscriboRequest(payload, sessionId);

      if (result && (result.success === 1 || result.transactionId)) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Order placed successfully! An invoice has been created and will be sent to your email.",
            transactionId: result.transactionId || null,
            member: {
              name: member.fullName,
              email: member.email,
            },
            total: `€${total.toFixed(2)}`,
          }),
          { status: 200, headers: corsHeaders(origin) }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to create invoice in Conscribo. Please try again or contact the board.",
          debug: result,
        }),
        { status: 500, headers: corsHeaders(origin) }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Server error: " + error.message,
        }),
        { status: 500, headers: corsHeaders(origin) }
      );
    }
  },
};
