/**
 * Rough token estimation for live UI feedback.
 * Heuristic: ~4 chars per token (OpenAI rule of thumb). Good enough for a counter
 * — the actual token count from the backend is exact.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}
