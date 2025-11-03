// Cloudflare Pages API endpoint: /api/runAIGeneration
// Typen 'any' används för context för att undvika typfel med Cloudflare Response.
export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  // TODO: Implement runAIGeneration logic
  return new Response(JSON.stringify({ error: "Not implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
};
