// Cloudflare Pages API endpoint: /api/createRun
// Typen 'any' används för context för att undvika typfel med Cloudflare Response.
export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // TODO: Validera payload, skapa run i Firestore och svara med id/kod.
  // Exempel på loggning:
  // console.log("createRun called", { bodyKeys: Object.keys(await request.json()) });

  return new Response(JSON.stringify({ error: "Not implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
};
