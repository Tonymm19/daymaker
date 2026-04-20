/**
 * DAYMAKER CONNECT — Microsoft Calendar Events API
 *
 * GET /api/calendar/microsoft/events
 *
 * Fetches upcoming calendar events using Microsoft Graph API
 * (/me/calendarView). Returns the next 30 days of events with
 * title, date/time, location, and attendee list.
 *
 * Handles token refresh when the access token has expired.
 * Read-only — we never modify the calendar.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

interface MSGraphEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location: { displayName: string };
  attendees: {
    emailAddress: { name: string; address: string };
    status: { response: string };
  }[];
  isAllDay: boolean;
  webLink: string;
  /** For expanded instances of recurring events, MS Graph returns the ID of
   *  the series master in `seriesMasterId`. Null for standalone events. */
  seriesMasterId?: string | null;
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
  source: 'microsoft';
  /** Series master ID for recurring events. Null for one-offs. */
  seriesId: string | null;
}

async function refreshMicrosoftToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number } | null> {
  try {
    const response = await fetch(MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'openid offline_access Calendars.Read User.Read',
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');

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

    // Get stored Microsoft tokens
    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (!userData?.microsoftCalendarConnected || !userData?.microsoftCalendarAccessToken) {
      return NextResponse.json(
        { error: 'Microsoft Calendar not connected', connected: false },
        { status: 400 }
      );
    }

    let accessToken = userData.microsoftCalendarAccessToken;

    // Check if token is expired and refresh if needed
    const tokenExpiry = userData.microsoftCalendarTokenExpiry;
    if (tokenExpiry && Date.now() > tokenExpiry - 60000) { // Refresh 1 min before expiry
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

      if (clientId && clientSecret && userData.microsoftCalendarRefreshToken) {
        const refreshed = await refreshMicrosoftToken(
          userData.microsoftCalendarRefreshToken,
          clientId,
          clientSecret
        );

        if (refreshed) {
          accessToken = refreshed.access_token;
          const updates: Record<string, unknown> = {
            microsoftCalendarAccessToken: refreshed.access_token,
            updatedAt: new Date(),
          };
          if (refreshed.refresh_token) {
            updates.microsoftCalendarRefreshToken = refreshed.refresh_token;
          }
          if (refreshed.expires_in) {
            updates.microsoftCalendarTokenExpiry = Date.now() + refreshed.expires_in * 1000;
          }
          await userRef.update(updates);
          console.log('[Microsoft Events] Tokens refreshed and saved');
        } else {
          // Refresh failed — user needs to reconnect
          await userRef.update({
            microsoftCalendarConnected: false,
            microsoftCalendarAccessToken: null,
            microsoftCalendarRefreshToken: null,
            microsoftCalendarTokenExpiry: null,
          });
          return NextResponse.json(
            { error: 'Microsoft authorization expired. Please reconnect.', connected: false, needsReconnect: true },
            { status: 401 }
          );
        }
      }
    }

    // Fetch calendar events for the next 30 days via Graph API calendarView
    const now = new Date();
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const calendarViewUrl = new URL(`${GRAPH_API_BASE}/me/calendarView`);
    calendarViewUrl.searchParams.set('startDateTime', now.toISOString());
    calendarViewUrl.searchParams.set('endDateTime', thirtyDaysLater.toISOString());
    calendarViewUrl.searchParams.set('$top', '50');
    calendarViewUrl.searchParams.set('$orderby', 'start/dateTime');
    calendarViewUrl.searchParams.set(
      '$select',
      'id,subject,bodyPreview,start,end,location,attendees,isAllDay,webLink,seriesMasterId'
    );

    const graphResponse = await fetch(calendarViewUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!graphResponse.ok) {
      const errorData = await graphResponse.json().catch(() => ({}));
      console.error('[Microsoft Events] Graph API error:', graphResponse.status, errorData);

      // Check for auth errors
      if (graphResponse.status === 401 || graphResponse.status === 403) {
        await userRef.update({
          microsoftCalendarConnected: false,
          microsoftCalendarAccessToken: null,
          microsoftCalendarRefreshToken: null,
          microsoftCalendarTokenExpiry: null,
        });
        return NextResponse.json(
          { error: 'Microsoft authorization expired. Please reconnect.', connected: false, needsReconnect: true },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: errorData?.error?.message || 'Failed to fetch Microsoft calendar events' },
        { status: 500 }
      );
    }

    const graphData = await graphResponse.json();
    const msEvents: MSGraphEvent[] = graphData.value || [];

    const events: CalendarEvent[] = msEvents.map((event) => ({
      id: event.id,
      title: event.subject || 'Untitled Event',
      description: event.bodyPreview || null,
      startTime: event.start?.dateTime ? new Date(event.start.dateTime + 'Z').toISOString() : '',
      endTime: event.end?.dateTime ? new Date(event.end.dateTime + 'Z').toISOString() : '',
      location: event.location?.displayName || null,
      attendees: (event.attendees || []).map((att) => ({
        name: att.emailAddress?.name || att.emailAddress?.address?.split('@')[0] || 'Unknown',
        email: att.emailAddress?.address || '',
        responseStatus: att.status?.response || 'none',
      })),
      isAllDay: event.isAllDay || false,
      htmlLink: event.webLink || '',
      source: 'microsoft' as const,
      seriesId: event.seriesMasterId || null,
    }));

    return NextResponse.json({
      connected: true,
      events,
      totalEvents: events.length,
    });

  } catch (error: unknown) {
    console.error('[Microsoft Events] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch Microsoft calendar events';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
