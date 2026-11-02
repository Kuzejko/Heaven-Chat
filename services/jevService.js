/**
 * TypeSafe AI / Jev Service for OpenRouter System One API.
 * Provides fast, calibrated decisions (Noul, Choice, Score) and smart RAG reranking.
 */

export const OPENROUTER_SYSTEMONE_URL = "https://openrouter.ai/api/v1/systemone";
export const DEFAULT_JEV_MODEL = "~typesafe/jev-latest";
export const NORDROUTER_EVALUATE_URL = "https://nordrouter.com/v1/evaluate";
export const DEFAULT_NORDROUTER_JEV_MODEL = "typesafe-ai/jev";

/**
 * Base low-level caller for System One / Evaluate endpoint.
 * Supports OpenRouter (/api/v1/systemone) and NordRouter (/v1/evaluate).
 * @param {Object} params
 * @param {string} [params.apiKey] API key (defaults to saved key for active provider)
 * @param {string} [params.baseUrl] Base URL for provider (e.g. https://nordrouter.com/v1)
 * @param {string} [params.apiProvider] Active provider ('openrouter' | 'nordrouter' | ...)
 * @param {string} [params.model] System One model slug (default: provider specific default)
 * @param {string|Object|Array} params.state The context/data being evaluated
 * @param {Object} params.questions Map of questionId -> question object { type, instructions, criteria, ... }
 * @param {number} [params.timeoutMs] Timeout in milliseconds (default: 15000)
 * @returns {Promise<{ ok: boolean, model?: string, answers?: Object, usage?: Object, error?: string }>}
 */
function dispatchJevLog(detail) {
  if (typeof document !== "undefined" && typeof document.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    try {
      document.dispatchEvent(new CustomEvent("jev-api-log", { detail }));
    } catch (_) {}
  }
}

/**
 * Helper to prepare questions according to provider requirements:
 * NordRouter: 'boolean' (with criteria { true, false }), 'choice', 'score', and field 'question'.
 * OpenRouter: 'noul' (with criteria or instructions).
 */
export function normalizeQuestionsForProvider(questions, isNordrouter) {
  if (!questions || typeof questions !== "object") return {};
  const normalized = {};
  for (const [key, q] of Object.entries(questions)) {
    if (!q || typeof q !== "object") continue;
    const item = { ...q };
    if (isNordrouter) {
      if (item.type === "noul") {
        item.type = "boolean";
      }
      if (!item.question && item.instructions) {
        item.question = item.instructions;
      }
      if (!item.instructions && item.question) {
        item.instructions = item.question;
      }
      if (!item.type) {
        item.type = "boolean";
      }
    } else {
      if (item.type === "boolean") {
        item.type = "noul";
      }
      if (!item.instructions && item.question) {
        item.instructions = item.question;
      }
      if (!item.type) {
        item.type = "noul";
      }
    }
    normalized[key] = item;
  }
  return normalized;
}

export async function askJevSystemOne({
  apiKey,
  baseUrl,
  apiProvider,
  model,
  state,
  questions,
  timeoutMs = 15000,
  actionLabel = "System One Decision"
}) {
  const startTime = Date.now();

  let storedSettings = null;
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("openrouter_api_settings_v1");
      if (raw) storedSettings = JSON.parse(raw);
    } catch (_) {}
  }

  const effectiveProvider = apiProvider || storedSettings?.apiProvider || "openrouter";
  const isNordrouter = effectiveProvider === "nordrouter";

  let effectiveApiKey = apiKey ? apiKey.trim() : "";
  if (!effectiveApiKey || effectiveApiKey === "lm-studio") {
    if (isNordrouter) {
      if (storedSettings?.nordrouterApiKey) {
        effectiveApiKey = storedSettings.nordrouterApiKey.trim();
      } else if (typeof localStorage !== "undefined") {
        effectiveApiKey = (localStorage.getItem("nordrouter_api_key_v1") || "").trim();
      }
    } else {
      if (typeof localStorage !== "undefined") {
        const saved = (localStorage.getItem("openrouter_api_key_v1") || "").trim();
        if (saved && saved !== "lm-studio") {
          effectiveApiKey = saved;
        }
      }
    }
  }

  let effectiveModel = (model && String(model).trim())
    ? String(model).trim()
    : ((storedSettings?.jevModel && String(storedSettings.jevModel).trim())
        ? String(storedSettings.jevModel).trim()
        : "");

  if (isNordrouter) {
    // NordRouter strict requirement: model must be typesafe-ai/jev
    if (!effectiveModel || effectiveModel.startsWith("~typesafe/") || effectiveModel === DEFAULT_JEV_MODEL) {
      effectiveModel = DEFAULT_NORDROUTER_JEV_MODEL;
    }
  } else {
    // OpenRouter default
    if (!effectiveModel || effectiveModel === DEFAULT_NORDROUTER_JEV_MODEL) {
      effectiveModel = DEFAULT_JEV_MODEL;
    }
  }

  let targetUrl = OPENROUTER_SYSTEMONE_URL;
  if (isNordrouter) {
    const rawBaseUrl = baseUrl || storedSettings?.nordrouterBaseUrl || "https://nordrouter.com/v1";
    targetUrl = `${String(rawBaseUrl).trim().replace(/\/+$/, "")}/evaluate`;
  }

  // NordRouter's upstream nginx does not serve CORS headers on /v1/evaluate (returns 405 on OPTIONS).
  // In a browser, route through the local server proxy to prevent browser CORS NetworkError.
  let requestUrl = targetUrl;
  const isBrowserHttp = typeof window !== "undefined" && Boolean(window.location?.protocol?.startsWith("http"));
  if (isNordrouter && isBrowserHttp) {
    requestUrl = `${window.location.origin}/api/nordrouter/evaluate`;
  }

  const providerDisplayName = isNordrouter ? "NordRouter" : "OpenRouter";

  if (!effectiveApiKey || effectiveApiKey === "lm-studio") {
    const errorMsg = `${providerDisplayName} API key is missing or invalid.`;
    dispatchJevLog({
      type: "systemone",
      action: actionLabel,
      model: effectiveModel,
      state,
      questions,
      error: errorMsg,
      latencyMs: 0,
      timestamp: startTime,
      ok: false
    });
    return { ok: false, error: errorMsg };
  }

  const preparedQuestions = normalizeQuestionsForProvider(questions, isNordrouter);
  const payload = {
    model: effectiveModel,
    state: state !== undefined ? state : "",
    questions: preparedQuestions
  };

  const headers = {
    "Authorization": `Bearer ${effectiveApiKey}`,
    "Content-Type": "application/json"
  };
  if (requestUrl !== targetUrl) {
    headers["X-Target-Url"] = targetUrl;
  }
  if (!isNordrouter) {
    headers["HTTP-Referer"] = "https://heaven-chat.local";
    headers["X-Title"] = "Heaven Chat";
  }

  const maxRetries = 2;
  let response = null;
  let latencyMs = 0;

  try {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        let currentUrl = requestUrl;
        response = await fetch(currentUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        // If local proxy returned 404 (e.g. server was not restarted) or 502, try direct targetUrl if different
        if ((response.status === 404 || response.status === 502) && currentUrl !== targetUrl) {
          try {
            const directRes = await fetch(targetUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(payload),
              signal: controller.signal
            });
            if (directRes && directRes.ok) {
              response = directRes;
            }
          } catch (_) {}
        }
        clearTimeout(timer);
        latencyMs = Date.now() - startTime;

        // Handle 429 rate limit with Retry-After header per NordRouter documentation
        if (response.status === 429 && attempt < maxRetries) {
          const retryHeader = response.headers.get("retry-after") || response.headers.get("Retry-After");
          const retrySec = parseInt(retryHeader || "1", 10);
          const waitMs = Math.min(Math.max(Number.isFinite(retrySec) ? retrySec : 1, 1) * 1000, 3000);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }

        break;
      } catch (innerErr) {
        clearTimeout(timer);
        // If direct fetch to NordRouter threw a browser CORS NetworkError, attempt local proxy fallback
        if (isNordrouter && typeof window !== "undefined") {
          try {
            const proxyUrl = (window.location && window.location.protocol.startsWith("http"))
              ? `${window.location.origin}/api/nordrouter/evaluate`
              : "http://localhost:3000/api/nordrouter/evaluate";
            const proxyRes = await fetch(proxyUrl, {
              method: "POST",
              headers: { ...headers, "X-Target-Url": targetUrl },
              body: JSON.stringify(payload)
            });
            if (proxyRes && (proxyRes.ok || proxyRes.status === 429)) {
              response = proxyRes;
              latencyMs = Date.now() - startTime;
              break;
            }
          } catch (_) {}
        }
        if (attempt >= maxRetries) throw innerErr;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!response || !response.ok) {
      const errText = response ? await response.text().catch(() => "") : "No response";
      const status = response ? response.status : 0;
      const errorMsg = `${providerDisplayName} SystemOne/Evaluate HTTP error ${status}: ${errText.slice(0, 300)}`;
      dispatchJevLog({
        type: "systemone",
        action: actionLabel,
        model: effectiveModel,
        state,
        questions: preparedQuestions,
        error: errorMsg,
        latencyMs,
        timestamp: startTime,
        ok: false
      });
      return { ok: false, error: errorMsg };
    }

    const data = await response.json();

    // Parse X-Charged-USD header if present (NordRouter cost tracking)
    const chargedHeader = response.headers ? (response.headers.get("x-charged-usd") || response.headers.get("X-Charged-USD")) : null;
    const costUsd = chargedHeader ? parseFloat(chargedHeader) : null;

    // Normalize answers format so probability and noul are both accessible
    const normalizedAnswers = {};
    if (data.answers && typeof data.answers === "object") {
      for (const [key, ans] of Object.entries(data.answers)) {
        if (ans && typeof ans === "object") {
          const prob = typeof ans.probability === "number"
            ? ans.probability
            : (typeof ans.noul === "number"
                ? ans.noul
                : (typeof ans.value === "number" ? ans.value : undefined));
          normalizedAnswers[key] = {
            ...ans,
            ...(prob !== undefined ? { probability: prob, noul: prob } : {})
          };
        } else {
          normalizedAnswers[key] = ans;
        }
      }
    }

    // Normalize usage tokens (input_tokens/output_tokens vs prompt_tokens/completion_tokens)
    const usage = data.usage ? {
      ...data.usage,
      prompt_tokens: data.usage.prompt_tokens ?? data.usage.input_tokens ?? 0,
      completion_tokens: data.usage.completion_tokens ?? data.usage.output_tokens ?? 0,
      input_tokens: data.usage.input_tokens ?? data.usage.prompt_tokens ?? 0,
      output_tokens: data.usage.output_tokens ?? data.usage.completion_tokens ?? 0
    } : null;

    dispatchJevLog({
      type: "systemone",
      action: actionLabel,
      model: data.model || effectiveModel,
      state,
      questions: preparedQuestions,
      answers: normalizedAnswers,
      usage,
      costUsd,
      id: data.id || null,
      latencyMs,
      timestamp: startTime,
      ok: true
    });

    return {
      ok: true,
      model: data.model || effectiveModel,
      answers: normalizedAnswers,
      usage,
      costUsd,
      id: data.id || null,
      latencyMs
    };
  } catch (err) {
    const finalLatencyMs = Date.now() - startTime;
    const isAbort = err.name === "AbortError" || err.message?.includes("aborted");
    const errorMsg = isAbort ? `Jev request timed out after ${timeoutMs}ms` : (err.message || String(err));
    dispatchJevLog({
      type: "systemone",
      action: actionLabel,
      model: effectiveModel,
      state,
      questions: preparedQuestions,
      error: errorMsg,
      latencyMs: finalLatencyMs,
      timestamp: startTime,
      ok: false
    });
    return { ok: false, error: errorMsg };
  }
}

/**
 * Convenience helper to evaluate a single boolean yes/no condition.
 * Returns probability between 0.0 and 1.0.
 */
export async function askJevBoolean({ apiKey, baseUrl, apiProvider, model, state, question, criteria, instructions, timeoutMs = 10000 }) {
  const questions = {
    q_main: {
      type: "boolean",
      question: question || instructions || "Evaluate condition",
      ...(criteria ? { criteria } : {}),
      ...(instructions ? { instructions } : {})
    }
  };

  const res = await askJevSystemOne({ apiKey, baseUrl, apiProvider, model, state: state !== undefined ? state : "", questions, timeoutMs });
  if (!res.ok || !res.answers?.q_main) {
    return null;
  }

  const ans = res.answers.q_main;
  return typeof ans.probability === "number" ? ans.probability : (typeof ans.noul === "number" ? ans.noul : null);
}

/**
 * Convenience helper to evaluate a choice selection among alternatives.
 * Returns { choice, probabilities, confidence }
 */
export async function askJevChoice({ apiKey, baseUrl, apiProvider, model, state, question, criteria, instructions, timeoutMs = 10000 }) {
  const questions = {
    q_main: {
      type: "choice",
      question: question || instructions || "Select option",
      ...(criteria ? { criteria } : {}),
      ...(instructions ? { instructions } : {})
    }
  };

  const res = await askJevSystemOne({ apiKey, baseUrl, apiProvider, model, state: state !== undefined ? state : "", questions, timeoutMs });
  if (!res.ok || !res.answers?.q_main) {
    return null;
  }

  const ans = res.answers.q_main;
  return {
    choice: ans.choice || null,
    probabilities: ans.probabilities || {},
    confidence: ans.confidence ?? null
  };
}

/**
 * Convenience helper to evaluate an ordinal rating / score.
 * Returns { score, probabilities, confidence }
 */
export async function askJevScore({ apiKey, baseUrl, apiProvider, model, state, question, criteria, instructions, timeoutMs = 10000 }) {
  const questions = {
    q_main: {
      type: "score",
      question: question || instructions || "Score rating",
      ...(criteria ? { criteria } : {}),
      ...(instructions ? { instructions } : {})
    }
  };

  const res = await askJevSystemOne({ apiKey, baseUrl, apiProvider, model, state: state !== undefined ? state : "", questions, timeoutMs });
  if (!res.ok || !res.answers?.q_main) {
    return null;
  }

  const ans = res.answers.q_main;
  return {
    score: ans.score ?? null,
    probabilities: ans.probabilities || {},
    confidence: ans.confidence ?? null
  };
}

/**
 * Convenience helper to evaluate a single yes/no condition via Noul.
 * Returns probability between 0.0 (strong no) and 1.0 (strong yes).
 */
export async function askJevNoul({ apiKey, baseUrl, apiProvider, model, stateText, instructions, criteria, timeoutMs = 10000 }) {
  const questions = {
    q_main: {
      type: "noul",
      instructions,
      ...(criteria ? { criteria } : {})
    }
  };

  const res = await askJevSystemOne({ apiKey, baseUrl, apiProvider, model, state: stateText, questions, timeoutMs });
  if (!res.ok || !res.answers?.q_main) {
    return null;
  }

  const ans = res.answers.q_main;
  return typeof ans.noul === "number" ? ans.noul : null;
}

/**
 * Smart batch reranker for candidate memories using Jev.
 * Evaluates multiple memory chunks in a single fast parallel System One query.
 * 
 * @param {Object} options
 * @param {string} [options.apiKey] API key
 * @param {string} [options.baseUrl] Base URL
 * @param {string} [options.apiProvider] Active provider
 * @param {string} options.currentContext Current conversation turn(s) / user query
 * @param {Array<Object>} options.candidateChunks Array of { text, messageIndex, role, score }
 * @param {number} [options.threshold] Minimum relevance probability to include (default: 0.60)
 * @param {number} [options.topK] Max number of memories to return (default: 3)
 * @param {string} [options.model] Jev model identifier
 * @param {number} [options.timeoutMs] Timeout in ms (default: 12000)
 * @returns {Promise<Array<Object>>} Reranked, filtered array of candidate chunks with jevRelevance
 */
export async function rerankMemoriesWithJev({
  apiKey,
  baseUrl,
  apiProvider,
  currentContext,
  candidateChunks,
  threshold = 0.60,
  topK = 3,
  model,
  timeoutMs = 12000
}) {
  if (!Array.isArray(candidateChunks) || candidateChunks.length === 0) {
    return [];
  }

  // Cap candidates to evaluate (e.g. max 6 candidates to keep token usage small and fast)
  const pool = candidateChunks.slice(0, 6);

  const structuredState = {
    current_dialogue: currentContext,
    candidate_memories: pool.map((c, i) => ({
      id: `cand_${i}`,
      message_index: c.messageIndex,
      content: c.text
    }))
  };

  const questions = {};
  pool.forEach((_, i) => {
    questions[`cand_${i}`] = {
      type: "noul",
      instructions: `Does memory snippet candidate_memories[${i}] contain specific facts, events, promises, items, or relationships directly relevant to understanding or responding to current_dialogue?`,
      criteria: {
        true: "Contains concrete background, context, agreements, or lore directly related to what is being discussed or acted upon.",
        false: "Completely unrelated topic, generic greeting, filler text, or unrelated banter."
      }
    };
  });

  const res = await askJevSystemOne({
    apiKey,
    baseUrl,
    apiProvider,
    model,
    state: structuredState,
    questions,
    timeoutMs,
    actionLabel: "🧠 RAG Память: Переранжирование"
  });

  if (!res.ok || !res.answers) {
    console.warn("[Jev Service] Rerank fallback due to error:", res.error);
    // Graceful fallback to lexical ranking
    return pool.slice(0, topK);
  }

  // Attach Jev relevance probability to each candidate
  const scored = pool.map((chunk, i) => {
    const ans = res.answers[`cand_${i}`];
    const relevance = (ans && typeof ans.noul === "number") ? ans.noul : 0;
    return {
      ...chunk,
      jevRelevance: relevance
    };
  });

  // Filter by threshold
  const filtered = scored.filter(c => c.jevRelevance >= threshold);

  // Sort descending by Jev relevance
  filtered.sort((a, b) => b.jevRelevance - a.jevRelevance);

  return filtered.slice(0, topK);
}

/**
 * Checks whether active character directives were fulfilled in the dialogue using Jev Noul questions.
 * Evaluates multiple directives in a single fast parallel System One query.
 * 
 * @param {Object} options
 * @param {string} [options.apiKey] API key
 * @param {string} [options.baseUrl] Base URL
 * @param {string} [options.apiProvider] Active provider
 * @param {string} [options.userMessage] Last user message for context
 * @param {string} options.characterResponse Assistant response text
 * @param {Array<Object>} options.activeDirectives Array of active directive objects
 * @param {number} [options.threshold] Confidence threshold (default 0.70)
 * @param {string} [options.model] Jev model identifier
 * @param {number} [options.timeoutMs] Timeout in ms (default 12000)
 * @returns {Promise<Array<{ directive: Object, confidence: number }>>} Completed directives with confidence
 */
export async function checkDirectivesWithJev({
  apiKey,
  baseUrl,
  apiProvider,
  userMessage = "",
  characterResponse = "",
  activeDirectives = [],
  threshold = 0.70,
  model,
  timeoutMs = 12000
}) {
  if (!Array.isArray(activeDirectives) || activeDirectives.length === 0) {
    return [];
  }

  // Filter out keep-mode directives (they are continuous constraints, not one-time accomplishments)
  const candidates = activeDirectives.filter(d => d && d.active !== false && d.mode !== "keep");
  if (candidates.length === 0) {
    return [];
  }

  if (!characterResponse || !characterResponse.trim()) {
    return [];
  }

  // Cap to max 5 directives to prevent huge questions
  const pool = candidates.slice(0, 5);

  const cleanResponse = characterResponse
    .replace(/<thought[\s\S]*?<\/thought>/gi, "")
    .replace(/<thought[\s\S]*/gi, "")
    .trim();

  const structuredState = {
    user_message: userMessage || "",
    character_reply: cleanResponse,
    directives: pool.map((d, i) => ({
      id: `dir_${i}`,
      goal_description: d.text
    }))
  };

  const questions = {};
  pool.forEach((d, i) => {
    questions[`dir_${i}`] = {
      type: "noul",
      instructions: `In character_reply (or its immediate interaction with user_message), has the character performed, initiated, or fulfilled the goal described in directives[${i}].goal_description: "${d.text}"?`,
      criteria: {
        true: `The character clearly stated, offered, performed, or accomplished the action or goal described in "${d.text}".`,
        false: `The character did not perform or fulfill this specific goal yet, or only discussed something completely different.`
      }
    };
  });

  const res = await askJevSystemOne({
    apiKey,
    baseUrl,
    apiProvider,
    model,
    state: structuredState,
    questions,
    timeoutMs,
    actionLabel: "🎯 Детектор целей персонажа"
  });

  if (!res.ok || !res.answers) {
    return [];
  }

  const completed = [];
  pool.forEach((d, i) => {
    const ans = res.answers[`dir_${i}`];
    const noul = (ans && typeof ans.noul === "number") ? ans.noul : 0;
    if (noul >= threshold) {
      completed.push({
        directive: d,
        confidence: noul
      });
    }
  });

  return completed;
}

export const JEV_STATE_DELTA_MAP = {
  strong_drop: -3,
  slight_drop: -1,
  unchanged: 0,
  slight_gain: 1,
  strong_gain: 3
};

export const JEV_MOOD_CHOICES = ["happy", "sad", "angry", "flirty", "neutral", "excited", "nervous"];

/**
 * Unified single-turn evaluator using Jev System One.
 * Evaluates directives, mood, custom state shifts (coreStates), and plot significance in ONE parallel batch call.
 * @param {Object} params
 * @returns {Promise<{ ok: boolean, completedDirectives: Array, mood: string|null, moodConfidence: number, stateChanges: Array, isPlotSignificant: boolean, plotSignificanceScore: number, error?: string }>}
 */
export async function evaluateTurnWithJev({
  apiKey,
  baseUrl,
  apiProvider,
  model,
  userMessage = "",
  characterResponse = "",
  activeDirectives = [],
  character = null,
  char2 = null,
  currentStates = {},
  isDuo = false,
  timeoutMs = 12000
}) {
  if (!characterResponse || !characterResponse.trim()) {
    return { ok: false, error: "Empty character response" };
  }

  const cleanResponse = characterResponse
    .replace(/<thought[\s\S]*?<\/thought>/gi, "")
    .replace(/<thought[\s\S]*/gi, "")
    .trim();

  // 1. Directives to test (max 5)
  const candidateDirectives = (Array.isArray(activeDirectives) ? activeDirectives : [])
    .filter(d => d && d.active !== false && d.mode !== "keep")
    .slice(0, 5);

  // 2. Custom coreStates for primary character (up to 4)
  const charCoreStates = (character?.coreStates || []).slice(0, 4);

  // 3. Custom coreStates for char2 if duo (up to 4)
  const char2CoreStates = (isDuo && char2?.coreStates) ? char2.coreStates.slice(0, 4) : [];

  const structuredState = {
    user_message: userMessage || "",
    character_reply: cleanResponse,
    character_name: character?.name || "Character",
    ...(isDuo && char2 ? { second_character_name: char2.name } : {})
  };

  const questions = {};

  // Question: Directives
  candidateDirectives.forEach((d, i) => {
    questions[`dir_${i}`] = {
      type: "noul",
      instructions: `In character_reply (or its immediate interaction with user_message), has the character performed, initiated, or fulfilled the goal described in "${d.text}"?`,
      criteria: {
        true: `The character clearly stated, offered, performed, or accomplished the action or goal described in "${d.text}".`,
        false: `The character did not perform or fulfill this specific goal yet, or only discussed something completely different.`
      }
    };
  });

  // Question: Mood
  questions["mood"] = {
    type: "choice",
    instructions: `What is the prevailing emotional mood of ${character?.name || "the character"} at the end of character_reply?`,
    criteria: {
      happy: "Warm, pleased, cheerful, joyful or content.",
      sad: "Melancholic, sorrowful, depressed or downcast.",
      angry: "Irritated, hostile, enraged, furious or defensive.",
      flirty: "Playful, seductive, teasing, affectionate or romantic.",
      neutral: "Calm, objective, composed, casual or emotionally steady.",
      excited: "Enthusiastic, eager, passionate, thrilled or energized.",
      nervous: "Anxious, fearful, apprehensive, hesitant, shy or tense."
    }
  };

  if (isDuo && char2) {
    questions["duo_mood"] = {
      type: "choice",
      instructions: `What is the prevailing emotional mood of ${char2.name} at the end of character_reply?`,
      criteria: {
        happy: "Warm, pleased, cheerful, joyful or content.",
        sad: "Melancholic, sorrowful, depressed or downcast.",
        angry: "Irritated, hostile, enraged, furious or defensive.",
        flirty: "Playful, seductive, teasing, affectionate or romantic.",
        neutral: "Calm, objective, composed, casual or emotionally steady.",
        excited: "Enthusiastic, eager, passionate, thrilled or energized.",
        nervous: "Anxious, fearful, apprehensive, hesitant, shy or tense."
      }
    };
  }

  // Question: Core states (primary character)
  charCoreStates.forEach(cs => {
    const key = cs.key;
    const curVal = currentStates[key] !== undefined ? currentStates[key] : (cs.defaultValue ?? 50);
    questions[`state_${key}`] = {
      type: "choice",
      instructions: `Based on the interaction in user_message and character_reply, how did the dimension "${cs.displayName || key}" for ${character.name} change? (Current level is ${curVal}/100)`,
      criteria: {
        strong_drop: `A major negative event, deep offense, betrayal, or drastic decrease in "${cs.displayName || key}".`,
        slight_drop: `A minor disagreement, slight tension, or small decline in "${cs.displayName || key}".`,
        unchanged: `Neutral conversation or no meaningful impact on "${cs.displayName || key}".`,
        slight_gain: `A pleasant moment, small agreement, or minor increase in "${cs.displayName || key}".`,
        strong_gain: `A major breakthrough, deep intimacy, big victory, or drastic increase in "${cs.displayName || key}".`
      }
    };
  });

  // Question: Core states (second character in duo)
  char2CoreStates.forEach(cs => {
    const key = cs.key;
    const duoKey = `duo_${key}`;
    const curVal = currentStates[duoKey] !== undefined ? currentStates[duoKey] : (currentStates[key] !== undefined ? currentStates[key] : (cs.defaultValue ?? 50));
    questions[`state_duo_${key}`] = {
      type: "choice",
      instructions: `Based on the interaction in user_message and character_reply, how did the dimension "${cs.displayName || key}" for ${char2.name} change? (Current level is ${curVal}/100)`,
      criteria: {
        strong_drop: `A major negative event, deep offense, betrayal, or drastic decrease in "${cs.displayName || key}".`,
        slight_drop: `A minor disagreement, slight tension, or small decline in "${cs.displayName || key}".`,
        unchanged: `Neutral conversation or no meaningful impact on "${cs.displayName || key}".`,
        slight_gain: `A pleasant moment, small agreement, or minor increase in "${cs.displayName || key}".`,
        strong_gain: `A major breakthrough, deep intimacy, big victory, or drastic increase in "${cs.displayName || key}".`
      }
    };
  });

  // Question: Plot significance
  questions["is_plot_significant"] = {
    type: "noul",
    instructions: "Did a significant story event occur in this turn (such as entering a new location, a sworn promise, revealing a crucial secret, major relationship change, or obtaining/giving an important item)?",
    criteria: {
      true: "A meaningful plot turning point, promise, secret reveal, or significant world state change occurred.",
      false: "Routine dialogue, pleasantries, banter, minor idle actions, or everyday conversation with no major plot impact."
    }
  };

  const res = await askJevSystemOne({
    apiKey,
    baseUrl,
    apiProvider,
    model,
    state: structuredState,
    questions,
    timeoutMs,
    actionLabel: "⚡ Оценка хода (Директивы, Настроение, Шкалы, Сюжет)"
  });

  if (!res.ok || !res.answers) {
    return { ok: false, error: res.error || "System One request failed" };
  }

  // 1. Parse completed directives (threshold >= 0.70)
  const completedDirectives = [];
  candidateDirectives.forEach((d, i) => {
    const ans = res.answers[`dir_${i}`];
    const noul = (ans && typeof ans.noul === "number") ? ans.noul : 0;
    if (noul >= 0.70) {
      completedDirectives.push({
        directive: d,
        confidence: noul
      });
    }
  });

  // 2. Parse mood (choice confidence >= 0.55)
  let mood = null;
  let moodConfidence = 0;
  const moodAns = res.answers["mood"];
  if (moodAns && typeof moodAns.choice === "string") {
    moodConfidence = typeof moodAns.confidence === "number" ? moodAns.confidence : 1.0;
    if (moodConfidence >= 0.55 && JEV_MOOD_CHOICES.includes(moodAns.choice.toLowerCase())) {
      mood = moodAns.choice.toLowerCase();
    }
  }

  let duoMood = null;
  let duoMoodConfidence = 0;
  if (isDuo && char2) {
    const duoMoodAns = res.answers["duo_mood"];
    if (duoMoodAns && typeof duoMoodAns.choice === "string") {
      duoMoodConfidence = typeof duoMoodAns.confidence === "number" ? duoMoodAns.confidence : 1.0;
      if (duoMoodConfidence >= 0.55 && JEV_MOOD_CHOICES.includes(duoMoodAns.choice.toLowerCase())) {
        duoMood = duoMoodAns.choice.toLowerCase();
      }
    }
  }

  // 3. Parse coreStates deltas
  const stateChanges = [];
  const parseStateDelta = (ansKey, targetStateKey) => {
    const ans = res.answers[ansKey];
    if (ans && typeof ans.choice === "string") {
      const choice = ans.choice.toLowerCase();
      const delta = JEV_STATE_DELTA_MAP[choice];
      if (typeof delta === "number" && delta !== 0) {
        stateChanges.push({
          key: targetStateKey,
          value: delta,
          type: "number",
          reason: "Jev System One evaluation"
        });
      }
    }
  };

  charCoreStates.forEach(cs => {
    parseStateDelta(`state_${cs.key}`, cs.key);
  });

  char2CoreStates.forEach(cs => {
    parseStateDelta(`state_duo_${cs.key}`, `duo_${cs.key}`);
  });

  // 4. Parse plot significance
  let plotSignificanceScore = 0;
  const sigAns = res.answers["is_plot_significant"];
  if (sigAns && typeof sigAns.noul === "number") {
    plotSignificanceScore = sigAns.noul;
  }
  const isPlotSignificant = plotSignificanceScore >= 0.35;

  return {
    ok: true,
    completedDirectives,
    mood,
    moodConfidence,
    duoMood,
    duoMoodConfidence,
    stateChanges,
    isPlotSignificant,
    plotSignificanceScore
  };
}

/**
 * Test Jev connection directly with a quick diagnostic probe.
 * @param {string|Object} options API key string or config object { apiKey, baseUrl, apiProvider, model }
 * @returns {Promise<Object>} Diagnostic result with latency, status, answers, and usage
 */
export async function testJevConnection(options = {}) {
  let apiKey = "";
  let baseUrl = null;
  let apiProvider = null;
  let model = null;

  if (typeof options === "string") {
    apiKey = options;
  } else if (options && typeof options === "object") {
    apiKey = options.apiKey || "";
    baseUrl = options.baseUrl || null;
    apiProvider = options.apiProvider || null;
    model = options.model || null;
  }

  const testState = {
    diagnostic_probe: true,
    client: "Heaven Chat System One Diagnostic UI",
    client_time: new Date().toISOString()
  };

  const testQuestions = {
    is_diagnostic_probe: {
      type: "boolean",
      question: "Is this payload an intentional diagnostic probe to test API connectivity?",
      instructions: "Is this payload an intentional diagnostic probe to test API connectivity?",
      criteria: {
        true: "Explicitly a diagnostic test or connectivity ping",
        false: "Real user conversational roleplay"
      }
    }
  };

  return await askJevSystemOne({
    apiKey,
    baseUrl,
    apiProvider,
    model,
    state: testState,
    questions: testQuestions,
    timeoutMs: 10000,
    actionLabel: "🧪 Экспресс-тест связи Jev System One"
  });
}

/**
 * Lightweight check to determine if the turn contains emotional, relationship,
 * status or tension shifts before invoking a full LLM evaluation call.
 * Uses a single fast Noul question.
 *
 * @param {Object} options
 * @param {string} [options.apiKey]
 * @param {string} [options.baseUrl]
 * @param {string} [options.apiProvider]
 * @param {string} [options.model]
 * @param {string} options.userMessage
 * @param {string} options.characterResponse
 * @param {number} [options.timeoutMs]
 * @returns {Promise<boolean>} True if significant state shift detected (or fallback true on error)
 */
export async function evaluateTurnSignificanceWithJev({
  apiKey,
  baseUrl,
  apiProvider,
  model,
  userMessage = "",
  characterResponse = "",
  timeoutMs = 8000
}) {
  if (!characterResponse || !characterResponse.trim()) return false;

  const cleanResponse = characterResponse
    .replace(/<(think|thought|thinking|reasoning|reflection|details)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .trim();

  // If both messages are very short/trivial greetings with no state words, quick return
  if (userMessage.length < 15 && cleanResponse.length < 50 && /^(привет|хай|здравствуй|hello|hi|hey)[!.?]?$/i.test(userMessage.trim())) {
    return false;
  }

  const statePayload = {
    user_speech: userMessage,
    character_reply: cleanResponse.slice(0, 500)
  };

  const questions = {
    has_state_shift: {
      type: "noul",
      instructions: "Did this dialogue turn cause any noticeable shift in interpersonal dynamics, trust, romantic tension, anger, physical danger, status, or emotional state?",
      criteria: {
        true: "A real emotional, physical, psychological, or relationship development occurred.",
        false: "Routine banter, idle greeting, minor repetition, or static dialogue with zero emotional or situational progression."
      }
    }
  };

  try {
    const res = await askJevSystemOne({
      apiKey,
      baseUrl,
      apiProvider,
      model,
      state: statePayload,
      questions,
      timeoutMs,
      actionLabel: "⚡ Оценка значимости хода (Jev)"
    });

    if (!res.ok || !res.answers?.has_state_shift) {
      return true;
    }

    const val = res.answers.has_state_shift.noul;
    return typeof val === "number" ? val >= 0.35 : true;
  } catch (err) {
    console.warn("[Jev Service] Turn significance check error:", err);
    return true;
  }
}

