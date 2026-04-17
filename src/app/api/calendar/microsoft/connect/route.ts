/**
 * DAYMAKER CONNECT — Microsoft Calendar OAuth Connect
 *
 * GET /api/calendar/microsoft/connect
 *
 * Generates the Microsoft identity platform v2.0 authorization URL
 * and redirects the user to Microsoft's consent screen.
 * Requests Calendars.Read + User.Read scopes (read-only).
 * Passes the Firebase UID in the state parameter.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';

export async function GET(req: NextRequest) {
  try {
    const { adminAuth } = await import('@/lib/firebase/admin');

    // Authenticate — get UID from token query param
    let uid: string | null = null;
    const tokenParam = req.nextUrl.searchParams.get('token');

    if (tokenParam) {
      try {
        const decoded = await adminAuth.verifyIdToken(tokenParam);
        uid = decoded.uid;
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized — please pass token query param' }, { status: 401 });
    }

    // Validate Microsoft OAuth is configured
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

    if (!clientId || !process.env.MICROSOFT_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Microsoft OAuth not configured. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to .env.local' },
        { status: 500 }
      );
    }

    // Build the authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri || 'http://localhost:3000/api/calendar/microsoft/callback',
      response_mode: 'query',
      scope: 'openid offline_access Calendars.Read User.Read',
      state: uid,
      prompt: 'consent', // Force consent to ensure refresh token
    });

    const authUrl = `${MICROSOFT_AUTH_URL}?${params.toString()}`;

    return NextResponse.redirect(authUrl);

  } catch (error: unknown) {
    console.error('[Microsoft Calendar Connect] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to connect Microsoft calendar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
