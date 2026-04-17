/**
 * DAYMAKER CONNECT — LinkedIn CSV Parser Tests
 *
 * Comprehensive test coverage for the LinkedIn CSV parser.
 * Tests edge cases from ANTIGRAVITY_TASKS.md:
 * - Standard LinkedIn export
 * - Junk rows before header
 * - Unicode names (Chinese, Arabic, accented)
 * - Apostrophes in names (O'Brien, Al-Farsi)
 * - Missing email fields
 * - Empty company/position
 * - Date parsing (DD Mon YYYY)
 * - Quoted CSV fields
 * - Match key generation
 * - SearchText building
 */

import { describe, it, expect } from 'vitest';
import {
  parseLinkedInCsv,
  parseCsvLine,
  parseLinkedInDate,
  findHeaderRow,
  buildColumnMap,
  generateMatchKey,
  buildSearchText,
} from '../linkedin-parser';

// ============================================
// parseCsvLine
// ============================================

describe('parseCsvLine', () => {
  it('parses a simple comma-separated line', () => {
    expect(parseCsvLine('Alice,Smith,Google')).toEqual(['Alice', 'Smith', 'Google']);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCsvLine('"Smith, Jr.",Alice,Google')).toEqual(['Smith, Jr.', 'Alice', 'Google']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsvLine('"He said ""hello""",Bob,Company')).toEqual(['He said "hello"', 'Bob', 'Company']);
  });

  it('trims whitespace from fields', () => {
    expect(parseCsvLine('  Alice , Smith , Google ')).toEqual(['Alice', 'Smith', 'Google']);
  });

  it('handles empty fields', () => {
    expect(parseCsvLine('Alice,,Google')).toEqual(['Alice', '', 'Google']);
  });

  it('handles a single field', () => {
    expect(parseCsvLine('Alice')).toEqual(['Alice']);
  });

  it('handles empty string', () => {
    expect(parseCsvLine('')).toEqual(['']);
  });
});

// ============================================
// parseLinkedInDate
// ============================================

describe('parseLinkedInDate', () => {
  it('parses "25 Mar 2026" format', () => {
    const date = parseLinkedInDate('25 Mar 2026');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(2); // March = 2
    expect(date!.getDate()).toBe(25);
  });

  it('parses single-digit day "9 Dec 2019"', () => {
    const date = parseLinkedInDate('9 Dec 2019');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2019);
    expect(date!.getMonth()).toBe(11); // December = 11
    expect(date!.getDate()).toBe(9);
  });

  it('parses "01 Jan 2020"', () => {
    const date = parseLinkedInDate('01 Jan 2020');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2020);
    expect(date!.getMonth()).toBe(0);
    expect(date!.getDate()).toBe(1);
  });

  it('returns null for empty string', () => {
    expect(parseLinkedInDate('')).toBeNull();
  });

  it('returns null for invalid month', () => {
    expect(parseLinkedInDate('25 Xyz 2026')).toBeNull();
  });

  it('returns null for non-date string', () => {
    expect(parseLinkedInDate('not a date')).toBeNull();
  });

  it('handles padded whitespace', () => {
    const date = parseLinkedInDate('  25 Mar 2026  ');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
  });
});

// ============================================
// findHeaderRow & buildColumnMap
// ============================================

describe('findHeaderRow', () => {
  it('finds header in first row', () => {
    const rows = [['First Name', 'Last Name', 'URL']];
    expect(findHeaderRow(rows)).toBe(0);
  });

  it('finds header after junk rows', () => {
    const rows = [
      ['Notes', 'Some junk'],
      ['More junk'],
      ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'],
    ];
    expect(findHeaderRow(rows)).toBe(2);
  });

  it('returns -1 when no header found', () => {
    const rows = [['Name', 'Company'], ['Alice', 'Google']];
    expect(findHeaderRow(rows)).toBe(-1);
  });
});

describe('buildColumnMap', () => {
  it('maps all standard LinkedIn headers', () => {
    const header = ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On'];
    const map = buildColumnMap(header);
    expect(map.firstName).toBe(0);
    expect(map.lastName).toBe(1);
    expect(map.url).toBe(2);
    expect(map.email).toBe(3);
    expect(map.company).toBe(4);
    expect(map.position).toBe(5);
    expect(map.connectedOn).toBe(6);
  });

  it('handles reordered columns', () => {
    const header = ['Company', 'Position', 'First Name', 'Last Name', 'Connected On', 'URL', 'Email Address'];
    const map = buildColumnMap(header);
    expect(map.firstName).toBe(2);
    expect(map.lastName).toBe(3);
    expect(map.company).toBe(0);
    expect(map.url).toBe(5);
  });

  it('handles missing optional columns', () => {
    const header = ['First Name', 'Last Name'];
    const map = buildColumnMap(header);
    expect(map.firstName).toBe(0);
    expect(map.lastName).toBe(1);
    expect(map.url).toBeUndefined();
    expect(map.email).toBeUndefined();
  });
});

// ============================================
// generateMatchKey
// ============================================

describe('generateMatchKey', () => {
  it('generates a normalized key', () => {
    const key = generateMatchKey('Alice', 'Smith', 'https://linkedin.com/in/asmith');
    expect(key).toBe('alice|smith|httpslinkedincominasmith');
  });

  it('handles special characters and apostrophes', () => {
    const key = generateMatchKey("Patrick", "O'Brien", 'https://linkedin.com/in/pobrien');
    expect(key).toBe('patrick|obrien|httpslinkedincominpobrien');
  });

  it('generates same key regardless of casing', () => {
    const key1 = generateMatchKey('Alice', 'SMITH', 'https://linkedin.com/in/asmith');
    const key2 = generateMatchKey('ALICE', 'Smith', 'https://linkedin.com/in/asmith');
    expect(key1).toBe(key2);
  });
});

// ============================================
// buildSearchText
// ============================================

describe('buildSearchText', () => {
  it('concatenates all fields in lowercase', () => {
    const result = buildSearchText('Alice', 'Smith', 'Google', 'Engineer', ['AI/ML', 'Engineering']);
    expect(result).toBe('alice smith google engineer ai/ml engineering');
  });

  it('handles empty fields', () => {
    const result = buildSearchText('Alice', 'Smith', '', '', []);
    expect(result).toBe('alice smith');
  });

  it('handles empty categories', () => {
    const result = buildSearchText('Bob', 'Jones', 'Meta', 'PM');
    expect(result).toBe('bob jones meta pm');
  });
});

// ============================================
// parseLinkedInCsv — Main Parser
// ============================================

describe('parseLinkedInCsv', () => {
  it('parses a standard LinkedIn export', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alice,Smith,https://linkedin.com/in/asmith,alice@example.com,Google,Engineer,25 Mar 2026
Bob,Jones,https://linkedin.com/in/bjones,,Meta,Product Manager,01 Jan 2020`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(2);
    expect(result.skipped).toBe(0);

    expect(result.contacts[0].firstName).toBe('Alice');
    expect(result.contacts[0].lastName).toBe('Smith');
    expect(result.contacts[0].company).toBe('Google');
    expect(result.contacts[0].position).toBe('Engineer');
    expect(result.contacts[0].email).toBe('alice@example.com');
    expect(result.contacts[0].linkedInUrl).toBe('https://linkedin.com/in/asmith');
    expect(result.contacts[0].connectedOn).not.toBeNull();
    expect(result.contacts[0].connectedOn!.getFullYear()).toBe(2026);

    expect(result.contacts[1].firstName).toBe('Bob');
    expect(result.contacts[1].email).toBe(''); // Missing email is ok
  });

  it('handles junk rows before header', () => {
    const csv = `This is a LinkedIn export
Notes: downloaded on April 2026
First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alice,Smith,https://linkedin.com/in/asmith,,Google,Engineer,25 Mar 2026`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].firstName).toBe('Alice');
    // Should have an informational message about skipped rows
    expect(result.errors.some(e => e.includes('Skipped 2 row(s) before header'))).toBe(true);
  });

  it('handles Unicode names (Chinese)', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
张,伟,https://linkedin.com/in/zhangwei,,华为,工程师,15 Feb 2024`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].firstName).toBe('张');
    expect(result.contacts[0].lastName).toBe('伟');
    expect(result.contacts[0].company).toBe('华为');
  });

  it('handles Unicode names (accented characters)', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
José,García,https://linkedin.com/in/jgarcia,,Telefónica,Ingeniero,10 Jun 2023`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].firstName).toBe('José');
    expect(result.contacts[0].lastName).toBe('García');
  });

  it('handles names with apostrophes', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Patrick,O'Brien,https://linkedin.com/in/pobrien,,Acme Corp,CEO,20 Nov 2022
Mohammed,Al-Farsi,https://linkedin.com/in/malfarsi,,Saudi Aramco,VP,05 Aug 2021`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].lastName).toBe("O'Brien");
    expect(result.contacts[1].lastName).toBe('Al-Farsi');
  });

  it('handles missing email fields (empty)', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alice,Smith,https://linkedin.com/in/asmith,,Google,Engineer,25 Mar 2026`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts[0].email).toBe('');
  });

  it('handles empty company and position', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alice,Smith,https://linkedin.com/in/asmith,alice@example.com,,,25 Mar 2026`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts[0].company).toBe('');
    expect(result.contacts[0].position).toBe('');
  });

  it('skips rows where both firstName and lastName are empty', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alice,Smith,https://linkedin.com/in/asmith,,Google,Engineer,25 Mar 2026
,,https://linkedin.com/in/unknown,,Unknown Corp,Unknown,01 Jan 2020
Bob,Jones,https://linkedin.com/in/bjones,,Meta,PM,15 Jun 2023`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(2);
    expect(result.skipped).toBe(1);
  });

  it('handles empty CSV content', () => {
    const result = parseLinkedInCsv('');
    expect(result.contacts).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('empty');
  });

  it('handles CSV with no header row', () => {
    const csv = `Alice,Smith,Google,Engineer
Bob,Jones,Meta,PM`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(0);
    expect(result.errors.some(e => e.includes('Could not find header row'))).toBe(true);
  });

  it('handles quoted fields with commas in company names', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alice,Smith,https://linkedin.com/in/asmith,,"Acme, Inc.",Engineer,25 Mar 2026`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].company).toBe('Acme, Inc.');
  });

  it('handles \\r\\n line endings (Windows)', () => {
    const csv = "First Name,Last Name,URL,Email Address,Company,Position,Connected On\r\nAlice,Smith,https://linkedin.com/in/asmith,,Google,Engineer,25 Mar 2026\r\n";

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].firstName).toBe('Alice');
  });

  it('warns on unparseable dates but still returns the contact', () => {
    const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alice,Smith,https://linkedin.com/in/asmith,,Google,Engineer,2026-03-25`;

    const result = parseLinkedInCsv(csv);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].connectedOn).toBeNull();
    expect(result.errors.some(e => e.includes('Could not parse date'))).toBe(true);
  });

  it('handles large exports (performance check)', () => {
    let csv = 'First Name,Last Name,URL,Email Address,Company,Position,Connected On\n';
    for (let i = 0; i < 10000; i++) {
      csv += `User${i},Last${i},https://linkedin.com/in/user${i},user${i}@test.com,Company${i},Position${i},25 Mar 2026\n`;
    }

    const start = Date.now();
    const result = parseLinkedInCsv(csv);
    const duration = Date.now() - start;

    expect(result.contacts).toHaveLength(10000);
    expect(duration).toBeLessThan(5000); // Should parse 10k in under 5 seconds
  });
});
