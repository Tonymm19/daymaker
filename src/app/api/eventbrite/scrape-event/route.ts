/**
 * DAYMAKER CONNECT — Eventbrite Event Page Scraper
 *
 * POST /api/eventbrite/scrape-event
 *
 * Takes a public Eventbrite event URL and scrapes the page for:
 *   - Event title, description, date/time, location
 *   - Organizer/host names
 *   - Any publicly visible speaker/panelist information
 *
 * Lightweight approach — no OAuth or API keys. Eventbrite renders event
 * metadata in the HTML and embeds JSON-LD structured data for SEO.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface EventbriteScrapedData {
  eventTitle: string | null;
  eventDescription: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  eventLocation: string | null;
  hosts: string[];
  attendees: { name: string; company?: string; title?: string }[];
  imageUrl: string | null;
  eventbriteUrl: string;
}

function extractBetween(html: string, start: string, end: string): string | null {
  const startIdx = html.indexOf(start);
  if (startIdx === -1) return null;
  const contentStart = startIdx + start.length;
  const endIdx = html.indexOf(end, contentStart);
  if (endIdx === -1) return null;
  return html.substring(contentStart, endIdx).trim();
}

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

export async function POST(req: NextRequest) {
  try {
    const { adminAuth } = await import('@/lib/firebase/admin');

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.substring(7);
    try {
      await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await req.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    const eventbriteUrl = url.trim();
    if (!eventbriteUrl.toLowerCase().includes('eventbrite.com')) {
      return NextResponse.json({ error: 'Not a valid Eventbrite URL' }, { status: 400 });
    }

    console.log(`[Eventbrite Scraper] Fetching: ${eventbriteUrl}`);

    const response = await fetch(eventbriteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.error(`[Eventbrite Scraper] HTTP ${response.status}: ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch Eventbrite page (HTTP ${response.status})` },
        { status: 502 }
      );
    }

    const html = await response.text();

    const result: EventbriteScrapedData = {
      eventTitle: null,
      eventDescription: null,
      eventDate: null,
      eventEndDate: null,
      eventLocation: null,
      hosts: [],
      attendees: [],
      imageUrl: null,
      eventbriteUrl,
    };

    // ─── Strategy 1: JSON-LD structured data ──────────────────────────
    const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const jsonLd = JSON.parse(match[1]);
        const entries = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
        for (const entry of entries) {
          const type = entry['@type'];
          if (type === 'Event' || type === 'SocialEvent' || type === 'BusinessEvent' || (Array.isArray(type) && type.includes('Event'))) {
            result.eventTitle = result.eventTitle || entry.name || null;
            result.eventDescription = result.eventDescription || entry.description || null;
            result.eventDate = result.eventDate || entry.startDate || null;
            result.eventEndDate = result.eventEndDate || entry.endDate || null;
            result.imageUrl = result.imageUrl || (typeof entry.image === 'string' ? entry.image : entry.image?.url) || null;

            if (entry.location) {
              if (typeof entry.location === 'string') {
                result.eventLocation = entry.location;
              } else if (entry.location.name) {
                result.eventLocation = entry.location.name;
                if (entry.location.address) {
                  const addr = entry.location.address;
                  if (typeof addr === 'string') {
                    result.eventLocation += `, ${addr}`;
                  } else {
                    const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean);
                    if (parts.length) result.eventLocation += `, ${parts.join(', ')}`;
                  }
                }
              } else if (entry.location['@type'] === 'VirtualLocation') {
                result.eventLocation = 'Online Event';
              }
            }

            if (entry.organizer) {
              const orgs = Array.isArray(entry.organizer) ? entry.organizer : [entry.organizer];
              for (const org of orgs) {
                const name = org?.name || org;
                if (typeof name === 'string' && name.trim()) result.hosts.push(name.trim());
              }
            }

            if (entry.performer) {
              const performers = Array.isArray(entry.performer) ? entry.performer : [entry.performer];
              for (const perf of performers) {
                const name = perf?.name || perf;
                if (typeof name === 'string' && name.trim()) {
                  result.attendees.push({ name: name.trim(), title: 'Speaker' });
                }
              }
            }
          }
        }
      } catch {
        // Skip invalid JSON-LD blocks
      }
    }

    // ─── Strategy 2: Open Graph meta tags ─────────────────────────────
    if (!result.eventTitle) {
      const ogTitle = extractBetween(html, 'property="og:title" content="', '"');
      if (ogTitle) result.eventTitle = decodeHtml(ogTitle);
    }
    if (!result.eventDescription) {
      const ogDesc = extractBetween(html, 'property="og:description" content="', '"');
      if (ogDesc) result.eventDescription = decodeHtml(ogDesc);
    }
    if (!result.imageUrl) {
      const ogImage = extractBetween(html, 'property="og:image" content="', '"');
      if (ogImage) result.imageUrl = ogImage;
    }

    // ─── Strategy 3: <title> fallback ─────────────────────────────────
    if (!result.eventTitle) {
      const titleTag = extractBetween(html, '<title>', '</title>');
      if (titleTag) {
        result.eventTitle = titleTag.split('|')[0].split('Tickets')[0].trim();
      }
    }

    // ─── Strategy 4: meta description fallback ────────────────────────
    if (!result.eventDescription) {
      const metaDesc = extractBetween(html, 'name="description" content="', '"');
      if (metaDesc) result.eventDescription = decodeHtml(metaDesc);
    }

    // ─── Strategy 5: Organizer name from common Eventbrite patterns ───
    const organizerPatterns = [
      /class="[^"]*organizer-name[^"]*"[^>]*>([^<]+)</gi,
      /class="[^"]*organizer[^"]*title[^"]*"[^>]*>([^<]+)</gi,
      /data-testid="organizer-name"[^>]*>([^<]+)</gi,
    ];
    for (const pattern of organizerPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const name = stripHtml(match[1]).trim();
        if (name && !result.hosts.includes(name)) result.hosts.push(name);
      }
    }

    // ─── Strategy 6: Clean up and truncate description ────────────────
    if (result.eventDescription && result.eventDescription.includes('<')) {
      result.eventDescription = stripHtml(result.eventDescription);
    }
    if (result.eventDescription && result.eventDescription.length > 2000) {
      result.eventDescription = result.eventDescription.substring(0, 2000) + '...';
    }

    console.log(`[Eventbrite Scraper] Success: "${result.eventTitle}", ${result.hosts.length} hosts, ${result.attendees.length} speakers`);

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('[Eventbrite Scraper] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to scrape Eventbrite event';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
