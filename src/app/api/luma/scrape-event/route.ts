/**
 * DAYMAKER CONNECT — Luma Event Page Scraper
 *
 * POST /api/luma/scrape-event
 *
 * Takes a Luma event URL (e.g. https://lu.ma/uxlsq19r) and scrapes
 * the public event page for:
 *   - Event title, description, date/time, location
 *   - Host names
 *   - Any publicly visible attendee/speaker information
 *
 * Returns structured data for pre-populating the event briefing form.
 *
 * This is a server-side scraper — it fetches the Luma page HTML directly
 * and parses it. No browser automation needed since Luma renders event
 * metadata in the HTML and embeds structured JSON-LD data.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface LumaScrapedData {
  eventTitle: string | null;
  eventDescription: string | null;
  eventDate: string | null;
  eventEndDate: string | null;
  eventLocation: string | null;
  hosts: string[];
  attendees: { name: string; company?: string; title?: string }[];
  attendeeCount: number | null;
  imageUrl: string | null;
  lumaUrl: string;
}

/**
 * Extract text content between two markers in HTML
 */
function extractBetween(html: string, start: string, end: string): string | null {
  const startIdx = html.indexOf(start);
  if (startIdx === -1) return null;
  const contentStart = startIdx + start.length;
  const endIdx = html.indexOf(end, contentStart);
  if (endIdx === -1) return null;
  return html.substring(contentStart, endIdx).trim();
}

/**
 * Decode HTML entities
 */
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

/**
 * Strip HTML tags and clean up text
 */
function stripHtml(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

export async function POST(req: NextRequest) {
  try {
    const { adminAuth } = await import('@/lib/firebase/admin');

    // Authenticate
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

    // Validate it's a Luma URL
    const lumaUrl = url.trim();
    if (!lumaUrl.includes('lu.ma') && !lumaUrl.includes('luma.com')) {
      return NextResponse.json({ error: 'Not a valid Luma URL' }, { status: 400 });
    }

    console.log(`[Luma Scraper] Fetching: ${lumaUrl}`);

    // Fetch the Luma page
    const response = await fetch(lumaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.error(`[Luma Scraper] HTTP ${response.status}: ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch Luma page (HTTP ${response.status})` },
        { status: 502 }
      );
    }

    const html = await response.text();

    const result: LumaScrapedData = {
      eventTitle: null,
      eventDescription: null,
      eventDate: null,
      eventEndDate: null,
      eventLocation: null,
      hosts: [],
      attendees: [],
      attendeeCount: null,
      imageUrl: null,
      lumaUrl,
    };

    // ─── Strategy 1: Parse JSON-LD structured data ─────────────────
    // Luma embeds JSON-LD for SEO — this is the most reliable source
    const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const jsonLd = JSON.parse(match[1]);
        if (jsonLd['@type'] === 'Event' || jsonLd['@type'] === 'SocialEvent') {
          result.eventTitle = result.eventTitle || jsonLd.name || null;
          result.eventDescription = result.eventDescription || jsonLd.description || null;
          result.eventDate = result.eventDate || jsonLd.startDate || null;
          result.eventEndDate = result.eventEndDate || jsonLd.endDate || null;
          result.imageUrl = result.imageUrl || jsonLd.image || null;

          // Location
          if (jsonLd.location) {
            if (typeof jsonLd.location === 'string') {
              result.eventLocation = jsonLd.location;
            } else if (jsonLd.location.name) {
              result.eventLocation = jsonLd.location.name;
              if (jsonLd.location.address) {
                const addr = jsonLd.location.address;
                if (typeof addr === 'string') {
                  result.eventLocation += `, ${addr}`;
                } else if (addr.streetAddress || addr.addressLocality) {
                  const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean);
                  result.eventLocation += `, ${parts.join(', ')}`;
                }
              }
            }
          }

          // Organizer as host
          if (jsonLd.organizer) {
            const organizers = Array.isArray(jsonLd.organizer) ? jsonLd.organizer : [jsonLd.organizer];
            for (const org of organizers) {
              const name = org.name || org;
              if (typeof name === 'string' && name.trim()) {
                result.hosts.push(name.trim());
              }
            }
          }

          // Performer as speaker/attendee
          if (jsonLd.performer) {
            const performers = Array.isArray(jsonLd.performer) ? jsonLd.performer : [jsonLd.performer];
            for (const perf of performers) {
              const name = perf.name || perf;
              if (typeof name === 'string' && name.trim()) {
                result.attendees.push({ name: name.trim() });
              }
            }
          }
        }
      } catch {
        // Skip invalid JSON-LD blocks
      }
    }

    // ─── Strategy 2: Parse Open Graph meta tags ─────────────────────
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

    // ─── Strategy 3: Fallback to <title> tag ───────────────────────
    if (!result.eventTitle) {
      const titleTag = extractBetween(html, '<title>', '</title>');
      if (titleTag) {
        // Luma titles often have " · Luma" suffix
        result.eventTitle = titleTag.split('·')[0].split('|')[0].trim();
      }
    }

    // ─── Strategy 4: Parse meta description ─────────────────────────
    if (!result.eventDescription) {
      const metaDesc = extractBetween(html, 'name="description" content="', '"');
      if (metaDesc) result.eventDescription = decodeHtml(metaDesc);
    }

    // ─── Strategy 5: Extract host names from common Luma HTML patterns ──
    // Luma renders host names in specific patterns
    const hostPatterns = [
      /data-testid="host-name"[^>]*>([^<]+)</gi,
      /class="[^"]*host[^"]*name[^"]*"[^>]*>([^<]+)</gi,
      /Hosted by\s*<[^>]+>([^<]+)/gi,
    ];
    for (const pattern of hostPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const name = stripHtml(match[1]).trim();
        if (name && !result.hosts.includes(name)) {
          result.hosts.push(name);
        }
      }
    }

    // ─── Strategy 6: Extract attendee count ─────────────────────────
    const countPatterns = [
      /(\d+)\s*(?:going|attending|registered|guests?)/i,
      /(\d+)\s*(?:RSVPs?|people)/i,
    ];
    for (const pattern of countPatterns) {
      const match = html.match(pattern);
      if (match) {
        result.attendeeCount = parseInt(match[1], 10);
        break;
      }
    }

    // ─── Strategy 7: Extract visible attendee names ─────────────────
    // Luma sometimes shows attendee avatars/names in the page
    const attendeePatterns = [
      /data-testid="attendee-name"[^>]*>([^<]+)</gi,
      /class="[^"]*attendee[^"]*name[^"]*"[^>]*>([^<]+)</gi,
    ];
    for (const pattern of attendeePatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const name = stripHtml(match[1]).trim();
        if (name && !result.attendees.some(a => a.name === name) && !result.hosts.includes(name)) {
          result.attendees.push({ name });
        }
      }
    }

    // ─── Strategy 8: Parse Luma's __NEXT_DATA__ if present ──────────
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const pageProps = nextData?.props?.pageProps;

        if (pageProps) {
          // Event data
          const event = pageProps.event || pageProps.initialData?.event;
          if (event) {
            result.eventTitle = result.eventTitle || event.name || event.title || null;
            result.eventDescription = result.eventDescription || event.description || event.description_md || null;
            result.eventDate = result.eventDate || event.start_at || null;
            result.eventEndDate = result.eventEndDate || event.end_at || null;

            if (event.geo_address_json) {
              try {
                const geo = typeof event.geo_address_json === 'string'
                  ? JSON.parse(event.geo_address_json)
                  : event.geo_address_json;
                result.eventLocation = result.eventLocation || geo.full_address || geo.place_name || null;
              } catch { /* skip */ }
            }

            if (event.location_type === 'online' && !result.eventLocation) {
              result.eventLocation = 'Online Event';
            }
          }

          // Hosts
          const hosts = pageProps.hosts || pageProps.initialData?.hosts || [];
          for (const host of hosts) {
            const name = host.name || host.display_name;
            if (name && !result.hosts.includes(name)) {
              result.hosts.push(name);
            }
          }

          // Guests / attendees
          const guests = pageProps.guests || pageProps.initialData?.guests || [];
          for (const guest of guests) {
            const name = guest.name || guest.display_name;
            if (name && !result.attendees.some(a => a.name === name)) {
              result.attendees.push({
                name,
                company: guest.company || guest.organization || undefined,
                title: guest.title || guest.role || undefined,
              });
            }
          }

          // Featured guests / speakers
          const speakers = pageProps.featured_guests || pageProps.speakers || [];
          for (const speaker of speakers) {
            const name = speaker.name || speaker.display_name;
            if (name && !result.attendees.some(a => a.name === name)) {
              result.attendees.push({
                name,
                company: speaker.company || speaker.organization || undefined,
                title: speaker.title || 'Speaker',
              });
            }
          }

          // Attendee count
          if (pageProps.guest_count !== undefined) {
            result.attendeeCount = pageProps.guest_count;
          }
        }
      } catch (e) {
        console.error('[Luma Scraper] Failed to parse __NEXT_DATA__:', e);
      }
    }

    // Clean up description — strip HTML if it came from a rich field
    if (result.eventDescription && result.eventDescription.includes('<')) {
      result.eventDescription = stripHtml(result.eventDescription);
    }

    // Truncate very long descriptions
    if (result.eventDescription && result.eventDescription.length > 2000) {
      result.eventDescription = result.eventDescription.substring(0, 2000) + '...';
    }

    console.log(`[Luma Scraper] Success: "${result.eventTitle}", ${result.hosts.length} hosts, ${result.attendees.length} attendees`);

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error: unknown) {
    console.error('[Luma Scraper] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to scrape Luma event';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
