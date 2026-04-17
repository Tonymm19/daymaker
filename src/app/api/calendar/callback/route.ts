/**
 * DAYMAKER CONNECT — Google Calendar OAuth Callback
 *
 * GET /api/calendar/callback
 *
 * Handles the OAuth callback from Google after the user grants consent.
 * Exchanges the authorization code for access + refresh tokens, stores
 * them securely in the user's Firestore document, and redirects back
 * to the events page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );
}

export async function GET(req: NextRequest) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');

    const { searchParams } = req.nextUrl;
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // This is the UID we passed
    const error = searchParams.get('error');

    // Handle Google denying access
    if (error) {
      console.error('[Calendar Callback] Google OAuth error:', error);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(`${appUrl}/events?calendar_error=${encodeURIComponent(error)}`);
    }

    // Validate required params
    if (!code || !state) {
      return NextResponse.json(
        { error: 'Missing code or state parameter' },
        { status: 400 }
      );
    }

    const uid = state;

    // Exchange authorization code for tokens
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.json(
        { error: 'Failed to obtain access token from Google' },
        { status: 500 }
      );
    }

    // Store tokens securely in Firestore
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({
      googleCalendarConnected: true,
      googleCalendarAccessToken: tokens.access_token,
      googleCalendarRefreshToken: tokens.refresh_token || null,
      googleCalendarTokenExpiry: tokens.expiry_date || null,
      updatedAt: new Date(),
    });

    console.log(`[Calendar Callback] Successfully connected Google Calendar for user ${uid}`);

    // Redirect back to events page with success indicator
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${appUrl}/events?calendar_connected=true`);

  } catch (error: unknown) {
    console.error('[Calendar Callback] Error:', error);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const message = error instanceof Error ? error.message : 'OAuth callback failed';
    return NextResponse.redirect(`${appUrl}/events?calendar_error=${encodeURIComponent(message)}`);
  }
}
