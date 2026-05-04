// ─── Centralized Claude Configuration ────────────────────────────────────────
// All model strings, token budgets, and routing live here.
// Import this file at every call site; do not hardcode model or max_tokens elsewhere.

const CLAUDE_MODELS = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-6'
}

// Hard output-token ceilings per model to clamp budgets against.
// These reflect safe API maximums; raise if Anthropic increases limits.
const MODEL_MAX_OUTPUT_TOKENS = {
  [CLAUDE_MODELS.haiku]:  8192,
  [CLAUDE_MODELS.sonnet]: 16000,
  [CLAUDE_MODELS.opus]:   16000
}

// Token budgets keyed by feature/task type.
// To adjust a budget, change it here only.
// Budget tiers:
//   quick/simple        1500-3000
//   normal chat/writing 4000-6000
//   scene draft/rewrite 8000-12000
//   deep analysis       12000-16000
const TOKEN_BUDGETS = {
  // Validation (tiny)
  validate:            10,

  // Quick / simple
  'writing-prompt':   200,
  'word-count':        50,
  'token-count':       50,
  logline:            800,
  'auto-tag':         300,
  spellcheck:         300,
  'scene-detect':     300,
  'summarize-context': 800,
  'research-ingest':  800,

  // Normal chat / writing help
  chat:              5000,
  'inline-suggest':  2500,
  'tone-adjust':     4000,
  'dialogue-coach':  5000,
  development:       3000,
  'tv-vs-feature':   3000,

  // Scene draft / rewrite
  'scene-draft':    10000,
  'scene-rewrite':  10000,
  'full-rewrite':   10000,

  // Deep analysis
  'scene-analyze':   6000,
  'beat-sheet-analyze': 8000,
  'story-bible-generate': 12000,
  'deep-analysis':  14000
}

// Features routed to Haiku (fast, cheap)
const HAIKU_FEATURES = [
  'auto-tag', 'spellcheck', 'scene-detect', 'token-count',
  'research-ingest', 'summarize-context', 'word-count'
]

// Features routed to Opus (heavyweight reasoning)
const OPUS_FEATURES = [
  'full-rewrite', 'scene-draft', 'scene-rewrite',
  'story-bible-generate', 'beat-sheet-analyze',
  'tv-vs-feature', 'plot-analysis', 'structure-analysis', 'deep-analysis'
]

/**
 * Returns the appropriate Claude model string for a given feature/task type.
 * Defaults to Sonnet for anything not explicitly mapped.
 */
function selectClaudeModel(feature) {
  if (HAIKU_FEATURES.includes(feature)) return CLAUDE_MODELS.haiku
  if (OPUS_FEATURES.includes(feature))  return CLAUDE_MODELS.opus
  return CLAUDE_MODELS.sonnet
}

/**
 * Returns the max_tokens budget for a given feature/task type,
 * clamped to the hard ceiling of the model that will be used.
 * Falls back to 1500 if the feature is not explicitly mapped.
 */
function selectMaxTokens(feature) {
  const model   = selectClaudeModel(feature)
  const budget  = TOKEN_BUDGETS[feature] ?? 1500
  const ceiling = MODEL_MAX_OUTPUT_TOKENS[model] ?? 8192
  return Math.min(budget, ceiling)
}

module.exports = {
  CLAUDE_MODELS,
  TOKEN_BUDGETS,
  MODEL_MAX_OUTPUT_TOKENS,
  selectClaudeModel,
  selectMaxTokens
}
