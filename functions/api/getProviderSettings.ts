// Cloudflare Pages API endpoint: /api/getProviderSettings
// Typen 'any' används för context för att undvika typfel med Cloudflare Response.
export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  // TODO: Implement getProviderSettings logic
  return new Response(JSON.stringify({ error: "Not implemented" }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
};
