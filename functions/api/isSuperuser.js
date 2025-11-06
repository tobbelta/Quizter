/**
 * Cloudflare Pages Function - Check if user is superuser
 * Checks if the provided email matches SUPERUSER_EMAIL environment variable
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  
  // Get email from header
  const userEmail = request.headers.get('x-user-email');
  
  // Get superuser email from environment variable
  // For local development, use a default superuser email
  const superuserEmail = env.SUPERUSER_EMAIL || 'admin@admin.se';
  
  // Check if user is superuser
  const isSuperuser = userEmail && superuserEmail && userEmail.toLowerCase() === superuserEmail.toLowerCase();
  
  return new Response(JSON.stringify({ isSuperuser }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
