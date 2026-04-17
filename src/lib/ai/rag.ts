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
 */
export async function retrieveRelevant(
  adminDb: FirebaseFirestore.Firestore,
  uid: string, 
  queryEmbedding: number[], 
  topK: number = 75
): Promise<any[]> {
  if (!adminDb) throw new Error('Admin DB not configured');
  
  // NOTE: Pulling all contacts into serverless memory.
  // Standard limits handle ~10k embeddings gracefully within ~2s.
  const snapshot = await adminDb.collection(`users/${uid}/contacts`).get();
  
  const scoredContacts = [];
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    
    // Only rank if they have an embedding
    if (data.embedding && Array.isArray(data.embedding)) {
      const score = cosineSimilarity(queryEmbedding, data.embedding);
      scoredContacts.push({
        id: doc.id,
        score,
        data,
      });
    }
  }
  
  // Sort descending by score
  scoredContacts.sort((a, b) => b.score - a.score);
  
  // Return the top-K mapped strictly back to data
  return scoredContacts.slice(0, topK).map(sc => sc.data);
}
