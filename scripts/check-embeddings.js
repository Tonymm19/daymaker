// Minimal .env.local loader (avoids adding a dotenv dep just for a diagnostic).
const fs = require('fs');
const path = require('path');
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
} catch (e) {
  console.error('Could not load .env.local:', e.message);
}
const admin = require('firebase-admin');

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
const clientEmail =
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (
  process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY
)?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function findTonya() {
  const NEEDLE = 'tonya';
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const match = page.users.find((u) => {
      const hay = `${u.displayName || ''} ${u.email || ''}`.toLowerCase();
      return hay.includes(NEEDLE) && hay.includes('long');
    });
    if (match) return match;
    pageToken = page.pageToken;
  } while (pageToken);
  // Fallback: just "tonya" if no long match
  pageToken = undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    const match = page.users.find((u) =>
      `${u.displayName || ''} ${u.email || ''}`.toLowerCase().includes(NEEDLE)
    );
    if (match) return match;
    pageToken = page.pageToken;
  } while (pageToken);
  return null;
}

(async () => {
  const user = await findTonya();
  if (!user) {
    console.log('No user matching "Tonya Long" found in Firebase Auth.');
    process.exit(0);
  }

  console.log('User:');
  console.log(`  uid:         ${user.uid}`);
  console.log(`  email:       ${user.email || '(none)'}`);
  console.log(`  displayName: ${user.displayName || '(none)'}`);
  console.log('');

  const snap = await db
    .collection(`users/${user.uid}/contacts`)
    .limit(5)
    .get();

  if (snap.empty) {
    console.log('No contacts found under this user.');
    process.exit(0);
  }

  console.log(`Checking first ${snap.size} contact(s) for embedding field:\n`);
  snap.docs.forEach((doc, i) => {
    const d = doc.data();
    const emb = d.embedding;
    const hasField = Object.prototype.hasOwnProperty.call(d, 'embedding');
    const isArray = Array.isArray(emb);
    const len = isArray ? emb.length : null;
    const nonZero = isArray && emb.some((n) => n !== 0);
    console.log(`  [${i + 1}] ${d.fullName || doc.id}`);
    console.log(`      hasEmbeddingField: ${hasField}`);
    console.log(`      type:              ${emb === null ? 'null' : typeof emb}${isArray ? ' (array)' : ''}`);
    console.log(`      length:            ${len ?? 'n/a'}`);
    console.log(`      hasNonZeroValues:  ${isArray ? nonZero : 'n/a'}`);
    console.log(`      embeddingText:     ${d.embeddingText ? 'present' : 'missing/null'}`);
    console.log('');
  });

  // Also show aggregate: total contacts and how many have non-null embeddings in first 100.
  const sample = await db
    .collection(`users/${user.uid}/contacts`)
    .limit(100)
    .get();
  const withEmb = sample.docs.filter(
    (d) => Array.isArray(d.data().embedding) && d.data().embedding.length > 0
  ).length;
  console.log(`Sample of ${sample.size}: ${withEmb} have a populated embedding array.`);
  process.exit(0);
})().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
