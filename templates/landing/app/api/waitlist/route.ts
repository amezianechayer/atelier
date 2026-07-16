/**
 * Capture d'emails de la waitlist. En v1 le template journalise l'inscription
 * (visible dans les logs Vercel de l'utilisateur). Le branchement vers une vraie
 * liste (Resend/base) est proposé comme mission de suivi par le CEO.
 */
export async function POST(request: Request): Promise<Response> {
  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email.trim() : '';
  } catch {
    return Response.json({ ok: false, error: 'json invalide' }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ ok: false, error: 'email invalide' }, { status: 400 });
  }
  console.log(JSON.stringify({ event: 'waitlist_signup', email, at: new Date().toISOString() }));
  return Response.json({ ok: true });
}
