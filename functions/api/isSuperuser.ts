// Cloudflare Pages Function: isSuperuser
export async function onRequest(context) {
  const superuserEmail = context.env.SUPERUSER_EMAIL;
  const userEmail = context.request.headers.get('x-user-email');
  return new Response(
    JSON.stringify({ isSuperuser: userEmail === superuserEmail }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
