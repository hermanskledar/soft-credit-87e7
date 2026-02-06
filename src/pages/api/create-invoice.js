const INVOICE_WORKER_URL = "https://invoice-handler.tskvspartacus.workers.dev";

export async function POST({ request }) {
  try {
    const body = await request.text();

    const workerResponse = await fetch(INVOICE_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    const data = await workerResponse.text();

    return new Response(data, {
      status: workerResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Failed to reach invoice service: " + error.message,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
