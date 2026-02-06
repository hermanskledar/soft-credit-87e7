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

  const responseText = await response.text();
  if (!responseText) {
    throw new Error(`Conscribo returned an empty response (status ${response.status}).`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      `Conscribo returned non-JSON response (status ${response.status}): ${responseText.slice(0, 200)}`
    );
  }
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
  const successValue = getCaseInsensitiveValue(data, "success");
  if (isConscriboSuccess(successValue)) {
    return getCaseInsensitiveValue(data, "sessionId");
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

function extractConscriboErrorMessage(result) {
  if (!result || typeof result !== "object") return null;

  const candidates = [
    "errorMessage",
    "errormessage",
    "message",
    "error",
    "errors",
    "errorMessages",
  ];

  for (const key of candidates) {
    if (result[key]) {
      const value = result[key];
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.filter(Boolean).join(", ");
      if (typeof value === "object") {
        if (value.message) return value.message;
        if (value.error) return value.error;
        if (value.detail) return value.detail;
      }
    }
  }

  return null;
}

function getCaseInsensitiveValue(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  const match = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
  return match ? obj[match] : undefined;
}

function isConscriboSuccess(value) {
  if (value === 1 || value === "1") return true;
  if (value === true || value === "true") return true;
  return false;
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
      const totalFormatted = total.toFixed(2);

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

      const successValue = getCaseInsensitiveValue(result, "success");
      const transactionId = getCaseInsensitiveValue(result, "transactionId");

      if (result && (isConscriboSuccess(successValue) || transactionId)) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Order placed successfully! An invoice has been created and will be sent to your email.",
            transactionId: transactionId || null,
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
          message:
            extractConscriboErrorMessage(result) ||
            "Failed to create invoice in Conscribo. Please try again or contact the board.",
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
