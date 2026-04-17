/**
 * DAYMAKER CONNECT — Google Calendar Events API
 *
 * GET /api/calendar/events
 *
 * Fetches upcoming calendar events for the authenticated user using
 * stored OAuth tokens. Handles token refresh if needed.
 *
 * Returns up to 50 events from the next 30 days with:
 * - title, date/time, location, attendee list
 *
 * Read-only — we never modify the calendar.
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

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  attendees: { name: string; email: string; responseStatus: string }[];
  isAllDay: boolean;
  htmlLink: string;
}

export async function GET(req: NextRequest) {
  try {
    const { adminDb } = await import('@/lib/firebase/admin');
    const { adminAuth } = await import('@/lib/firebase/admin');

    // Authenticate
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get stored calendar tokens
    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (!userData?.googleCalendarConnected || !userData?.googleCalendarAccessToken) {
      return NextResponse.json(
        { error: 'Google Calendar not connected', connected: false },
        { status: 400 }
      );
    }

    // Set up OAuth2 client with stored tokens
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: userData.googleCalendarAccessToken,
      refresh_token: userData.googleCalendarRefreshToken || undefined,
      expiry_date: userData.googleCalendarTokenExpiry || undefined,
    });

    // Handle token refresh — save new tokens to Firestore
    oauth2Client.on('tokens', async (tokens) => {
      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (tokens.access_token) {
        updates.googleCalendarAccessToken = tokens.access_token;
      }
      if (tokens.refresh_token) {
        updates.googleCalendarRefreshToken = tokens.refresh_token;
      }
      if (tokens.expiry_date) {
        updates.googleCalendarTokenExpiry = tokens.expiry_date;
      }
      try {
        await userRef.update(updates);
        console.log('[Calendar Events] Tokens refreshed and saved');
      } catch (err) {
        console.error('[Calendar Events] Failed to save refreshed tokens:', err);
      }
    });

    // Fetch calendar events for the next 30 days
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: thirtyDaysLater.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events: CalendarEvent[] = (response.data.items || []).map((event) => {
      const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);

      return {
        id: event.id || '',
        title: event.summary || 'Untitled Event',
        description: event.description || null,
        startTime: event.start?.dateTime || event.start?.date || '',
        endTime: event.end?.dateTime || event.end?.date || '',
        location: event.location || null,
        attendees: (event.attendees || []).map((att) => ({
          name: att.displayName || att.email?.split('@')[0] || 'Unknown',
          email: att.email || '',
          responseStatus: att.responseStatus || 'needsAction',
        })),
        isAllDay,
        htmlLink: event.htmlLink || '',
      };
    });

    return NextResponse.json({
      connected: true,
      events,
      totalEvents: events.length,
    });

  } catch (error: unknown) {
    console.error('[Calendar Events] Error:', error);

    // Check if it's a token/auth error — user needs to reconnect
    const message = error instanceof Error ? error.message : 'Failed to fetch calendar events';
    const isAuthError = message.includes('invalid_grant') ||
                        message.includes('Token has been expired') ||
                        message.includes('Token has been revoked');

    if (isAuthError) {
      // Clear the stored tokens since they're invalid
      try {
        const { adminDb } = await import('@/lib/firebase/admin');
        const { adminAuth } = await import('@/lib/firebase/admin');
        const authHeader = req.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ')) {
          const decoded = await adminAuth.verifyIdToken(authHeader.substring(7));
          await adminDb.collection('users').doc(decoded.uid).update({
            googleCalendarConnected: false,
            googleCalendarAccessToken: null,
            googleCalendarRefreshToken: null,
            googleCalendarTokenExpiry: null,
          });
        }
      } catch { /* best effort cleanup */ }

      return NextResponse.json(
        { error: 'Calendar authorization expired. Please reconnect.', connected: false, needsReconnect: true },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
