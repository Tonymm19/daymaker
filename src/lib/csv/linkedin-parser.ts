/**
 * DAYMAKER CONNECT — LinkedIn CSV Parser
 *
 * Parses LinkedIn's "Download Your Data" CSV export format.
 * Handles junk rows before headers, column mapping by name,
 * Unicode, apostrophes, and the DD Mon YYYY date format.
 *
 * Reference: ARCHITECTURE.md section 5
 */

import type { ParsedContact } from '@/lib/types';

// ============================================
// Types
// ============================================

export interface ParseResult {
  contacts: ParsedContact[];
  errors: string[];
  skipped: number;
}

// ============================================
// Month Mapping for "DD Mon YYYY" parsing
// ============================================

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// ============================================
// Known LinkedIn column headers
// ============================================

const LINKEDIN_HEADERS = {
  firstName: 'First Name',
  lastName: 'Last Name',
  url: 'URL',
  email: 'Email Address',
  company: 'Company',
  position: 'Position',
  connectedOn: 'Connected On',
} as const;

// ============================================
// CSV Line Parser (handles quoted fields)
// ============================================

/**
 * Parse a single CSV line into fields, respecting quoted values
 * that may contain commas, newlines, or escaped quotes.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("") 
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"' && current === '') {
        // Start of quoted field
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ',') {
        fields.push(current.trim());
        current = '';
        i++;
        continue;
      }
      current += char;
      i++;
    }
  }

  // Push the last field
  fields.push(current.trim());

  return fields;
}

// ============================================
// Date Parser
// ============================================

/**
 * Parse LinkedIn's "DD Mon YYYY" date format.
 * Examples: "25 Mar 2026", "01 Jan 2020", "9 Dec 2019"
 *
 * Returns null if the format is unrecognized.
 */
export function parseLinkedInDate(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;

  const cleaned = dateStr.trim();
  // Match "DD Mon YYYY" pattern
  const match = cleaned.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthStr = match[2].toLowerCase();
  const year = parseInt(match[3], 10);

  const month = MONTH_MAP[monthStr];
  if (month === undefined) return null;

  // Validate ranges
  if (day < 1 || day > 31 || year < 1900 || year > 2100) return null;

  return new Date(year, month, day);
}

// ============================================
// Header Detection
// ============================================

/**
 * Find the header row index by scanning for a row containing "First Name".
 * Returns -1 if no header row is found.
 */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.some((cell) => cell.trim() === LINKEDIN_HEADERS.firstName)) {
      return i;
    }
  }
  return -1;
}

/**
 * Build a column index map from header names.
 * Maps each known LinkedIn header to its column index.
 */
export function buildColumnMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const trimmed = headerRow.map((h) => h.trim());

  for (const [key, headerName] of Object.entries(LINKEDIN_HEADERS)) {
    const idx = trimmed.indexOf(headerName);
    if (idx !== -1) {
      map[key] = idx;
    }
  }

  return map;
}

// ============================================
// Match Key Generation
// ============================================

/**
 * Generate a normalized match key for deduplication.
 * Normalizes by lowercasing, stripping non-alphanumeric, removing whitespace.
 */
export function generateMatchKey(
  firstName: string,
  lastName: string,
  linkedInUrl: string
): string {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalize(firstName) + '|' + normalize(lastName) + '|' + normalize(linkedInUrl);
}

// ============================================
// SearchText Builder
// ============================================

/**
 * Build the searchText field for a contact.
 * Lowercase concatenation of name, company, position, and category names.
 */
export function buildSearchText(
  firstName: string,
  lastName: string,
  company: string,
  position: string,
  categories: string[] = []
): string {
  return [firstName, lastName, company, position, ...categories]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// ============================================
// Main Parser
// ============================================

/**
 * Parse a LinkedIn CSV export string into an array of ParsedContact objects.
 *
 * @param csvContent - Raw CSV string content
 * @returns ParseResult with contacts, errors, and skipped count
 */
export function parseLinkedInCsv(csvContent: string): ParseResult {
  const contacts: ParsedContact[] = [];
  const errors: string[] = [];
  let skipped = 0;

  if (!csvContent || !csvContent.trim()) {
    errors.push('CSV content is empty');
    return { contacts, errors, skipped };
  }

  // Split into lines, handling both \r\n and \n
  const lines = csvContent.split(/\r?\n/);

  // Parse all lines into field arrays
  const rows = lines.map((line) => parseCsvLine(line));

  // Find the header row
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) {
    errors.push('Could not find header row containing "First Name". Is this a LinkedIn connections export?');
    return { contacts, errors, skipped };
  }

  if (headerIdx > 0) {
    // Inform about skipped junk rows (not an error, just informational)
    errors.push(`Skipped ${headerIdx} row(s) before header row`);
  }

  // Build column map from header row
  const colMap = buildColumnMap(rows[headerIdx]);

  // Validate required columns exist
  if (colMap.firstName === undefined || colMap.lastName === undefined) {
    errors.push('Missing required columns: "First Name" and/or "Last Name"');
    return { contacts, errors, skipped };
  }

  // Parse data rows (everything after the header)
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];

    // Skip empty rows
    if (row.length === 0 || (row.length === 1 && row[0] === '')) {
      continue;
    }

    const firstName = (row[colMap.firstName] || '').trim();
    const lastName = (row[colMap.lastName] || '').trim();

    // Skip rows where both firstName AND lastName are empty
    if (!firstName && !lastName) {
      skipped++;
      continue;
    }

    const url = colMap.url !== undefined ? (row[colMap.url] || '').trim() : '';
    const email = colMap.email !== undefined ? (row[colMap.email] || '').trim() : '';
    const company = colMap.company !== undefined ? (row[colMap.company] || '').trim() : '';
    const position = colMap.position !== undefined ? (row[colMap.position] || '').trim() : '';
    const connectedOnStr = colMap.connectedOn !== undefined ? (row[colMap.connectedOn] || '').trim() : '';

    const connectedOn = parseLinkedInDate(connectedOnStr);

    // Warn if date parsing failed (not fatal)
    if (connectedOnStr && !connectedOn) {
      errors.push(`Row ${i + 1}: Could not parse date "${connectedOnStr}" for ${firstName} ${lastName}`);
    }

    contacts.push({
      firstName,
      lastName,
      company,
      position,
      email,
      linkedInUrl: url,
      connectedOn,
    });
  }

  return { contacts, errors, skipped };
}
