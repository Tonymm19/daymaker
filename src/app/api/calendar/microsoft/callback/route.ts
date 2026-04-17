/**
 * DAYMAKER CONNECT — Microsoft Calendar OAuth Callback
 *
 * GET /api/calendar/microsoft/callback
 *
 * Handles the OAuth callback from Microsoft after consent.
 * Exchanges the authorization code for access + refresh tokens
 * via the v2.0 token endpoint, stores them in Firestore,
 * and redirects back to the events page.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export async function GET(req: NextRequest) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');

    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // UID
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Handle Microsoft denying access
    if (error) {
      console.error('[Microsoft Callback] OAuth error:', error, errorDescription);
      return NextResponse.redirect(
        `${appUrl}/events?calendar_error=${encodeURIComponent(errorDescription || error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing code or state parameter' },
        { status: 400 }
      );
    }

    const uid = state;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/calendar/microsoft/callback';

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Microsoft OAuth not configured' }, { status: 500 });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid offline_access Calendars.Read User.Read',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('[Microsoft Callback] Token exchange failed:', tokenData);
      return NextResponse.redirect(
        `${appUrl}/events?calendar_error=${encodeURIComponent(tokenData.error_description || 'Token exchange failed')}`
      );
    }

    // Store tokens in Firestore
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({
      microsoftCalendarConnected: true,
      microsoftCalendarAccessToken: tokenData.access_token,
      microsoftCalendarRefreshToken: tokenData.refresh_token || null,
      microsoftCalendarTokenExpiry: tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : null,
      updatedAt: new Date(),
    });

    console.log(`[Microsoft Callback] Successfully connected Microsoft Calendar for user ${uid}`);

    return NextResponse.redirect(`${appUrl}/events?calendar_connected=microsoft`);

  } catch (error: unknown) {
    console.error('[Microsoft Callback] Error:', error);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const message = error instanceof Error ? error.message : 'Microsoft OAuth callback failed';
    return NextResponse.redirect(
      `${appUrl}/events?calendar_error=${encodeURIComponent(message)}`
    );
  }
}
