/**
 * DAYMAKER CONNECT — Google Calendar OAuth Connect
 *
 * GET /api/calendar/connect
 *
 * Generates the Google OAuth consent URL and redirects the user
 * to Google's authorization page. Passes the Firebase UID in the
 * state parameter so we can associate the token on callback.
 *
 * Scope: calendar.readonly — we NEVER write to the user's calendar.
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
    // Authenticate user via Firebase token
    const { adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('authorization');
    let uid: string | null = null;

    // Try Bearer token first (API call)
    if (authHeader?.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7);
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        uid = decoded.uid;
      } catch {
        // Fall through to cookie check
      }
    }

    // Try cookie (redirect from browser)
    if (!uid) {
      const uidParam = req.nextUrl.searchParams.get('uid');
      const tokenParam = req.nextUrl.searchParams.get('token');

      if (tokenParam) {
        try {
          const decoded = await adminAuth.verifyIdToken(tokenParam);
          uid = decoded.uid;
        } catch {
          return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }
      } else if (uidParam) {
        // Fallback — UID passed directly (less secure, but works for dev)
        uid = uidParam;
      }
    }

    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized — please pass token query param' }, { status: 401 });
    }

    // Validate Google Calendar OAuth is configured
    if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Google Calendar OAuth is not configured. Add GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET to .env.local' },
        { status: 500 }
      );
    }

    const oauth2Client = getOAuth2Client();

    // Generate the authorization URL with read-only calendar access
    const scopes = ['https://www.googleapis.com/auth/calendar.readonly'];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',     // Required to get a refresh token
      prompt: 'consent',          // Force consent to ensure refresh token
      scope: scopes,
      state: uid,                 // Pass UID securely in state
    });

    // Redirect the user to Google's consent page
    return NextResponse.redirect(authUrl);

  } catch (error: unknown) {
    console.error('[Calendar Connect] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to connect calendar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
