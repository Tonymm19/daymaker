/**
 * DAYMAKER CONNECT — Claude API Wrapper
 *
 * Reusable Anthropic SDK wrapper with:
 * - Retry logic with exponential backoff for rate limits
 * - Token counting for cost tracking
 * - Model selection (default: claude-sonnet-4-20250514)
 *
 * Used by: Categorization pipeline (Task 4), AI Query Agent (Task 6)
 */

import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CLAUDE_MODEL } from '@/lib/constants';

// ============================================
// Types
// ============================================

export interface ClaudeRequest {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ClaudeResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  durationMs: number;
}

// ============================================
// Singleton Client
// ============================================

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ============================================
// Retry Logic
// ============================================

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Claude with automatic retry on rate limits (429) and server errors (5xx).
 * Uses exponential backoff: 1s, 2s, 4s.
 */
export async function callClaude(request: ClaudeRequest): Promise<ClaudeResponse> {
  const client = getClient();
  const model = request.model || DEFAULT_CLAUDE_MODEL;
  const maxTokens = request.maxTokens || 4096;
  const temperature = request.temperature ?? 0.1;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`[Claude] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
      await sleep(delay);
    }

    const start = Date.now();

    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: request.systemPrompt,
        messages: [
          {
            role: 'user',
            content: request.userMessage,
          },
        ],
      });

      const durationMs = Date.now() - start;

      // Extract text content
      const textBlock = response.content.find((block) => block.type === 'text');
      const content = textBlock ? textBlock.text : '';

      return {
        content,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        model: response.model,
        durationMs,
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a retryable error
      const isRateLimited = lastError.message.includes('429') || lastError.message.includes('rate_limit');
      const isServerError = lastError.message.includes('500') || lastError.message.includes('529') || lastError.message.includes('overloaded');

      if ((isRateLimited || isServerError) && attempt < MAX_RETRIES) {
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('Claude API call failed after retries');
}

// ============================================
// JSON Extraction Helper
// ============================================

/**
 * Extract and parse JSON from Claude's response.
 * Handles cases where Claude wraps JSON in markdown code fences.
 */
export function extractJson<T>(response: string): T {
  let cleaned = response.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  return JSON.parse(cleaned) as T;
}
