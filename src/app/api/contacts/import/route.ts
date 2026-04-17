/**
 * DAYMAKER CONNECT — Contacts Import API Route
 *
 * POST /api/contacts/import
 *
 * Accepts a CSV file upload, parses LinkedIn connections,
 * and performs a differential import into Firestore.
 *
 * Reference: ARCHITECTURE.md sections 5.2 and 5.3
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseLinkedInCsv, generateMatchKey, buildSearchText } from '@/lib/csv/linkedin-parser';
import { FIRESTORE_BATCH_LIMIT } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Lazy-import Firebase Admin to avoid build-time initialization
    const { adminDb, adminAuth } = await import('@/lib/firebase/admin');
    const { FieldValue, Timestamp } = await import('firebase-admin/firestore');

    // --- 1. Authenticate ---
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

    // --- 2. Extract CSV from form data ---
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const csvContent = await file.text();
    if (!csvContent.trim()) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    // --- 3. Parse CSV ---
    const parseResult = parseLinkedInCsv(csvContent);
    if (parseResult.contacts.length === 0 && parseResult.errors.some(e => e.includes('Could not find header'))) {
      return NextResponse.json({
        error: 'Invalid CSV format. Could not find LinkedIn header row.',
        errors: parseResult.errors,
      }, { status: 400 });
    }

    // --- 4. Generate batch ID ---
    const batchId = `import_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // --- 5. Load existing contacts for match key comparison ---
    const contactsRef = adminDb.collection(`users/${uid}/contacts`);
    const existingSnapshot = await contactsRef.get();

    // Build a map of matchKey → existing document
    const existingMap = new Map<string, { docId: string; company: string; position: string }>();
    existingSnapshot.forEach((doc) => {
      const data = doc.data();
      const matchKey = generateMatchKey(
        data.firstName || '',
        data.lastName || '',
        data.linkedInUrl || ''
      );
      existingMap.set(matchKey, {
        docId: doc.id,
        company: data.company || '',
        position: data.position || '',
      });
    });

    // --- 6. Categorize contacts into creates and updates ---
    let imported = 0;
    let updated = 0;
    const now = Timestamp.now();

    // Collect all operations
    const operations: Array<{
      type: 'create' | 'update';
      docRef: FirebaseFirestore.DocumentReference;
      data: Record<string, unknown>;
    }> = [];

    for (const contact of parseResult.contacts) {
      const matchKey = generateMatchKey(contact.firstName, contact.lastName, contact.linkedInUrl);
      const fullName = `${contact.firstName} ${contact.lastName}`.trim();
      const searchText = buildSearchText(
        contact.firstName,
        contact.lastName,
        contact.company,
        contact.position
      );

      const existing = existingMap.get(matchKey);

      if (existing) {
        // --- UPDATE existing contact ---
        const updateData: Record<string, unknown> = {
          company: contact.company,
          position: contact.position,
          lastUpdated: now,
          importBatchId: batchId,
          searchText,
          fullName,
        };

        // Track company/position changes for movement detection
        if (contact.company && contact.company !== existing.company) {
          updateData.previousCompany = existing.company;
        }
        if (contact.position && contact.position !== existing.position) {
          updateData.previousPosition = existing.position;
        }

        // Only update email if the new one is non-empty
        if (contact.email) {
          updateData.email = contact.email;
        }

        operations.push({
          type: 'update',
          docRef: contactsRef.doc(existing.docId),
          data: updateData,
        });
        updated++;
      } else {
        // --- CREATE new contact ---
        const newDocRef = contactsRef.doc();
        const createData: Record<string, unknown> = {
          contactId: newDocRef.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          fullName,
          company: contact.company,
          position: contact.position,
          email: contact.email,
          linkedInUrl: contact.linkedInUrl,
          connectedOn: contact.connectedOn ? Timestamp.fromDate(contact.connectedOn) : null,
          categories: [], // Will be populated by categorization pipeline
          embedding: null,
          embeddingText: null,
          lastUpdated: now,
          previousCompany: null,
          previousPosition: null,
          importBatchId: batchId,
          searchText,
        };

        operations.push({
          type: 'create',
          docRef: newDocRef,
          data: createData,
        });
        imported++;
      }
    }

    // --- 7. Execute batched writes ---
    for (let i = 0; i < operations.length; i += FIRESTORE_BATCH_LIMIT) {
      const batchOps = operations.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = adminDb.batch();

      for (const op of batchOps) {
        if (op.type === 'create') {
          batch.set(op.docRef, op.data);
        } else {
          batch.update(op.docRef, op.data);
        }
      }

      await batch.commit();
    }

    // --- 8. Update user document ---
    const userRef = adminDb.doc(`users/${uid}`);
    await userRef.update({
      linkedInImportedAt: now,
      contactCount: FieldValue.increment(imported),
      updatedAt: now,
    });

    return NextResponse.json({
      imported,
      updated,
      skipped: parseResult.skipped,
      errors: parseResult.errors,
      batchId,
      total: parseResult.contacts.length,
    });
  } catch (error: unknown) {
    console.error('[Import API] Error:', error);
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
