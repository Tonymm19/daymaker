import OpenAI from 'openai';


let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("OPENAI_API_KEY is not defined. Features requiring text-embedding-3-small will fail.");
      _openai = new OpenAI({ apiKey: 'dummy-key-for-build' }); // Mock for build
    } else {
      _openai = new OpenAI({ apiKey });
    }
  }
  return _openai;
}

/**
 * Computes the cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates an embedding for a text string using text-embedding-3-small.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.trim().replace(/\n/g, ' '),
  });
  
  return response.data[0].embedding;
}

/**
 * Generates embeddings in batches for many items.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const cleanTexts = texts.map(t => t.trim().replace(/\n/g, ' '));
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: cleanTexts,
  });
  
  return response.data.map(d => d.embedding);
}

/**
 * Retrieves the top-K most relevant contacts by cosine similarity.
 *
 * Scans embeddings in pages and keeps only a running top-K so peak memory
 * is bounded by BATCH_SIZE × 1,536 floats rather than the full network.
 * Large networks (~9k contacts) were OOM-killing Cloud Run when the old
 * single-shot `.get()` loaded every full document plus its embedding.
 */
export async function retrieveRelevant(
  adminDb: FirebaseFirestore.Firestore,
  uid: string,
  queryEmbedding: number[],
  topK: number = 75
): Promise<any[]> {
  if (!adminDb) throw new Error('Admin DB not configured');

  const BATCH_SIZE = 500;
  const collRef = adminDb.collection(`users/${uid}/contacts`);

  type Candidate = { id: string; score: number };
  const top: Candidate[] = [];
  let minScoreInTop = -Infinity;

  const pushCandidate = (id: string, score: number) => {
    if (top.length < topK) {
      top.push({ id, score });
      if (top.length === topK) {
        top.sort((a, b) => b.score - a.score);
        minScoreInTop = top[top.length - 1].score;
      }
    } else if (score > minScoreInTop) {
      top[top.length - 1] = { id, score };
      top.sort((a, b) => b.score - a.score);
      minScoreInTop = top[top.length - 1].score;
    }
  };

  // Project to the embedding field only during the scan — the rest of each
  // contact doc is fetched in a second pass for the winners.
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let q: FirebaseFirestore.Query = collRef
      .select('embedding')
      .orderBy('__name__')
      .limit(BATCH_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const emb = doc.get('embedding');
      if (!Array.isArray(emb) || emb.length === 0) continue;
      const score = cosineSimilarity(queryEmbedding, emb as number[]);
      pushCandidate(doc.id, score);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_SIZE) break;
  }

  if (top.length === 0) return [];
  top.sort((a, b) => b.score - a.score);

  const refs = top.map(t => collRef.doc(t.id));
  const fullSnaps = await adminDb.getAll(...refs);
  const byId: Record<string, FirebaseFirestore.DocumentData> = {};
  for (const s of fullSnaps) {
    if (s.exists) byId[s.id] = s.data()!;
  }

  return top.map(t => byId[t.id]).filter(Boolean);
}
