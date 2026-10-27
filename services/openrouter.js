import { state } from "../js/state.js";
import { loadApiKey, saveModelEndpointsCache } from "./storage.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_RETRIES = 2;

function extractReasoningText(obj) {
  if (!obj || typeof obj !== "object") return "";
  const candidates = [
    obj.reasoning,
    obj.reasoning_content,
    obj.thought,
    obj.thinking,
    obj.reasoning_text,
    obj.reasoning_details,
    obj.reflection,
    obj.reflections
  ];
  for (const cand of candidates) {
    if (!cand) continue;
    if (typeof cand === "string") return cand;
    if (typeof cand === "object") {
      if (Array.isArray(cand)) {
        return cand.map(item => typeof item === "string" ? item : (item?.text || item?.thinking || item?.content || "")).join("");
      }
      return cand.text || cand.thinking || cand.content || cand.reasoning || "";
    }
  }
  return "";
}

function stripImagesFromMessages(messages) {
  return messages.map(msg => {
    if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter(p => p.type === "text" || typeof p === "string");
      const text = textParts.map(p => p.text || p).join("\n");
      return { ...msg, content: text };
    }
    return msg;
  });
}

function buildCombinedText(reasoning, content) {
  if (state.apiSettings?.thinkingDisplay === "hidden" || state.apiSettings?.enableInnerMonologue === false) {
    return content || "";
  }
  if (reasoning && reasoning.trim()) {
    const trimmedContent = content ? content.trim() : "";
    if (trimmedContent && /^\s*<(think|thought|thinking|reasoning|reflection|reflections|details)\b/i.test(trimmedContent)) {
      return trimmedContent;
    }
    if (trimmedContent && /^\s*\[(think|thought|thinking|reasoning|reflection|reflections)\]/i.test(trimmedContent)) {
      return trimmedContent;
    }
    return `<think>\n${reasoning.trim()}\n</think>\n${trimmedContent}`;
  }
  return content || "";
}

// applyPromptCachingToMessages removed — cache_control arrays are Anthropic-only
// and break message format for Gemini/Mistral on OpenRouter causing stream termination.

function formatMessagesForKobold(messages) {
  let prompt = "";
  for (const msg of messages) {
    if (msg.role === "system") {
      prompt += `${msg.content}\n\n`;
    } else if (msg.role === "user") {
      prompt += `User: ${msg.content}\n`;
    } else if (msg.role === "assistant") {
      prompt += `Assistant: ${msg.content}\n`;
    }
  }
  prompt += `Assistant:`;
  return prompt;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      return reject(err);
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
    };
    function cleanup() {
      clearTimeout(timer);
      if (signal && typeof signal.removeEventListener === "function") {
        signal.removeEventListener("abort", onAbort);
      }
    }
    if (signal && typeof signal.addEventListener === "function") {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export function extractRateLimitInfo(errorOrText, headers = null, defaultStatus = null) {
  let status = defaultStatus;
  let retryAfterSeconds = null;
  let message = "";
  let isRateLimit = false;

  let parsed = null;
  if (typeof errorOrText === "object" && errorOrText !== null) {
    if (errorOrText.status) status = errorOrText.status;
    if (errorOrText.retryAfter) retryAfterSeconds = errorOrText.retryAfter;
    if (errorOrText.isRateLimit) isRateLimit = true;
    parsed = errorOrText;
    if (errorOrText.message && typeof errorOrText.message === "string") {
      try {
        parsed = JSON.parse(errorOrText.message);
      } catch (_) {}
    }
  } else if (typeof errorOrText === "string") {
    try {
      parsed = JSON.parse(errorOrText);
    } catch (_) {}
  }

  if (parsed && typeof parsed === "object") {
    const errObj = parsed.error || parsed;
    if (errObj.code === 429 || errObj.status === 429 || status === 429) {
      isRateLimit = true;
    }
    if (errObj.provider_error_code === "upstream_429" || errObj.code === "rate_limit_exceeded") {
      isRateLimit = true;
    }
    
    // Check metadata / headers inside error body
    const meta = errObj.metadata || parsed.metadata;
    if (meta) {
      if (meta.retry_after_seconds !== undefined && meta.retry_after_seconds !== null) {
        retryAfterSeconds = Number(meta.retry_after_seconds);
      } else if (meta.retry_after_seconds_raw !== undefined && meta.retry_after_seconds_raw !== null) {
        retryAfterSeconds = Number(meta.retry_after_seconds_raw);
      } else if (meta.headers && (meta.headers["Retry-After"] || meta.headers["retry-after"])) {
        retryAfterSeconds = Number(meta.headers["Retry-After"] || meta.headers["retry-after"]);
      }
    }

    if (errObj.message) {
      message = typeof errObj.message === "string" ? errObj.message : JSON.stringify(errObj.message);
      if (/rate.?limit/i.test(message) || /upstream_429/i.test(message) || /429/.test(message)) {
        isRateLimit = true;
      }
    }
  }

  // Check HTTP headers
  if (!retryAfterSeconds && headers) {
    const retryHeader = (typeof headers.get === "function") 
      ? (headers.get("retry-after") || headers.get("Retry-After"))
      : (headers["retry-after"] || headers["Retry-After"]);
    if (retryHeader) {
      const parsedNum = Number(retryHeader);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        retryAfterSeconds = parsedNum;
      }
    }
  }

  // Fallback: check raw string if not parsed as JSON
  if (typeof errorOrText === "string") {
    if (!isRateLimit && /429|rate.?limit|upstream_429/i.test(errorOrText)) {
      isRateLimit = true;
    }
    if (!retryAfterSeconds) {
      const match = errorOrText.match(/retry_after_seconds(?:_raw)?["']?\s*:\s*([0-9.]+)/i) ||
                    errorOrText.match(/Retry-After["']?\s*:\s*["']?([0-9.]+)/i);
      if (match && match[1]) {
        retryAfterSeconds = Number(match[1]);
      }
    }
  }

  if (status === 429) {
    isRateLimit = true;
  }

  return {
    isRateLimit,
    retryAfterSeconds: (retryAfterSeconds && !isNaN(retryAfterSeconds) && retryAfterSeconds > 0) ? retryAfterSeconds : null,
    message
  };
}

function shouldRetry(error) {
  if (!error) return false;
  if (error.name === "AbortError" || error.message === "Aborted") return false;
  if (error.isNetworkError) return true;
  if (error.isRateLimit || error.status === 429) return true;
  if (!error.status) {
    if (error.message && /rate.?limit|upstream_429|code":\s*429/i.test(error.message)) {
      return true;
    }
    return false;
  }
  return error.status === 429 || (error.status >= 500 && error.status < 600);
}

function normalizeErrorStatus(status, payloadText, headers = null) {
  const rateInfo = extractRateLimitInfo(payloadText, headers, status);
  let cleanMsg = payloadText || `OpenRouter error: ${status}`;
  
  try {
    const json = JSON.parse(payloadText);
    if (json?.error?.message) {
      cleanMsg = json.error.message;
      if (json.error.metadata?.raw && typeof json.error.metadata.raw === "string") {
        cleanMsg = json.error.metadata.raw;
      }
    }
  } catch (_) {}

  const error = new Error(cleanMsg);
  error.status = status || (rateInfo.isRateLimit ? 429 : 500);
  error.rawPayload = payloadText;
  error.isRateLimit = rateInfo.isRateLimit || error.status === 429;
  if (rateInfo.retryAfterSeconds) {
    error.retryAfter = rateInfo.retryAfterSeconds;
  }
  return error;
}

export function buildProviderRoutingConfig() {
  if (!state.apiSettings) return null;
  const providerSort = state.apiSettings.providerSort || "price";
  const allowFallbacks = state.apiSettings.allowFallbacks !== false;
  const specificProvider = state.apiSettings.specificProvider;

  const config = {};
  if (providerSort && providerSort !== "default") {
    config.sort = providerSort;
  }
  if (specificProvider) {
    config.order = [specificProvider];
  }
  if (allowFallbacks !== undefined) {
    config.allow_fallbacks = allowFallbacks;
  }
  return Object.keys(config).length > 0 ? config : null;
}

export function mapOpenRouterError(error) {
  if (!error) return "Unknown error occurred.";
  if (error.name === "AbortError" || error.message === "Aborted") {
    return "Request timed out or was cancelled.";
  }
  if (error.status === 401 || error.status === 403) {
    return "Invalid API key or insufficient permissions.";
  }
  if (error.status === 429 || error.isRateLimit) {
    return "Rate limit reached. All retry attempts were exhausted. Please try again shortly or check your OpenRouter provider settings.";
  }
  if (error.status >= 500 && error.status < 600) {
    return "OpenRouter/Provider is temporarily unavailable (Server Error).";
  }
  if (error.isNetworkError) {
    return "Network error. Check your connection.";
  }
  
  if (typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.error?.metadata?.raw) return parsed.error.metadata.raw;
      if (parsed?.error?.message) return parsed.error.message;
      if (parsed?.message) return parsed.message;
    } catch (_) {}
    return error.message;
  }
  
  return "Request failed.";
}

function abortSignalAny(signals) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => {
      controller.abort(signal.reason);
    });
  }
  return controller.signal;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signals = [controller.signal, options.signal].filter(Boolean);
  const signal = signals.length === 1 ? signals[0] : abortSignalAny(signals);

  try {
    const response = await fetch(url, { ...options, signal });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }
    const wrapped = new Error(error.message || "Network error");
    wrapped.isNetworkError = true;
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

const MAX_RATE_LIMIT_RETRIES = 15;
const MAX_SERVER_RETRIES = 3;

async function withRetry(requestFn, options = {}) {
  const { signal, onRetry, model } = options;
  let attempt = 0;
  let lastError;

  while (true) {
    if (signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }

    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error.name === "AbortError" || error.message === "Aborted") {
        throw error;
      }

      const rateInfo = extractRateLimitInfo(error);
      const isRateLimited = rateInfo.isRateLimit || error.status === 429 || error.isRateLimit;
      const maxRetries = isRateLimited ? MAX_RATE_LIMIT_RETRIES : MAX_SERVER_RETRIES;

      if (!shouldRetry(error) || attempt >= maxRetries) {
        throw error;
      }

      let delayMs;
      const retryAfterSec = rateInfo.retryAfterSeconds || error.retryAfter;
      if (retryAfterSec && retryAfterSec > 0) {
        // Wait retry_after_seconds plus small margin to ensure provider bucket is reset
        delayMs = Math.ceil(retryAfterSec * 1000) + 750 + Math.floor(Math.random() * 500);
      } else if (isRateLimited) {
        delayMs = Math.min(12000, 2000 + attempt * 1500 + Math.floor(Math.random() * 500));
      } else {
        delayMs = Math.min(10000, 500 * (2 ** attempt) + Math.floor(Math.random() * 300));
      }

      attempt += 1;

      console.warn(`[OpenRouter API] Retryable error (${isRateLimited ? "429 Rate-Limit" : error.status || "Network"}). Attempt ${attempt}/${maxRetries}. Waiting ${(delayMs / 1000).toFixed(1)}s before retry.`, error.message);

      let remainingMs = delayMs;
      while (remainingMs > 0) {
        if (signal?.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        }

        const remainingSec = Math.ceil(remainingMs / 1000);
        const retryStatusText = `Лимит 429 • Повтор через ${remainingSec}с (${attempt}/${maxRetries})`;
        
        if (typeof onRetry === "function") {
          try {
            onRetry({
              attempt,
              maxRetries,
              remainingSeconds: remainingSec,
              delayMs,
              isRateLimited,
              statusText: retryStatusText,
              error
            });
          } catch (_) {}
        }

        if (typeof document !== "undefined") {
          document.dispatchEvent(new CustomEvent("openrouter-retry-status", {
            detail: {
              attempt,
              maxRetries,
              remainingSeconds: remainingSec,
              delayMs,
              isRateLimited,
              statusText: retryStatusText,
              model
            }
          }));
        }

        const sleepStep = Math.min(remainingMs, 1000);
        await abortableSleep(sleepStep, signal);
        remainingMs -= sleepStep;
      }
    }
  }
}

function parseSSEBuffer(buffer, onEvent) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const events = normalized.split("\n\n");
  const remainder = events.pop() || "";

  for (const eventBlock of events) {
    const lines = eventBlock
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    for (const dataLine of lines) {
      onEvent(dataLine);
    }
  }

  return remainder;
}

export async function sendMessageStream({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  repetitionPenalty,
  presencePenalty,
  frequencyPenalty,
  topP,
  minP,
  onToken,
  onRetry,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl,
  enableThinking = true,
  apiProvider
}) {
  const provider = apiProvider || state.apiSettings.apiProvider || "openrouter";
  const isKobold = provider === "kobold";

  let completionsUrl;
  let requestBody;
  const effectiveBaseUrl = (baseUrl || state.apiSettings?.localBaseUrl || "http://localhost:5000").replace(/\/+$/, "");
  if (isKobold) {
    completionsUrl = `${effectiveBaseUrl}/api/extra/generate/stream`;
    requestBody = {
      prompt: formatMessagesForKobold(messages),
      temperature: temperature ?? 0.7,
      max_length: maxTokens ?? 512,
      top_p: topP ?? 1.0,
      min_p: minP ?? 0.0,
      rep_pen: repetitionPenalty ?? 1.0
    };
  } else {
    const processedMessages = messages;
    completionsUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/chat/completions` : OPENROUTER_URL;
    requestBody = {
      model,
      messages: processedMessages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: temperature ?? 0.7,
      max_tokens: enableThinking ? Math.max(3000, (maxTokens || 800) * 2) : (maxTokens || 800)
    };
    if (repetitionPenalty !== undefined && repetitionPenalty !== null) requestBody.repetition_penalty = repetitionPenalty;
    if (frequencyPenalty !== undefined && frequencyPenalty !== null) requestBody.frequency_penalty = frequencyPenalty;
    if (presencePenalty !== undefined && presencePenalty !== null) requestBody.presence_penalty = presencePenalty;
    if (topP !== undefined && topP !== null) requestBody.top_p = topP;
    if (minP !== undefined && minP !== null) requestBody.min_p = minP;
    if (!baseUrl) {
      const providerRouting = buildProviderRoutingConfig();
      if (providerRouting) {
        requestBody.provider = providerRouting;
      }
      const isThinkingEnabled = enableThinking && (state.apiSettings?.thinkingDisplay !== "hidden") && (state.apiSettings?.enableInnerMonologue !== false);
      if (isThinkingEnabled) {
        requestBody.include_reasoning = true;
        requestBody.reasoning = { effort: "medium" };
      } else {
        requestBody.chat_template_kwargs = { enable_thinking: false };
        requestBody.reasoning = { exclude: true };
      }
    } else {
      const isThinkingEnabled = enableThinking && (state.apiSettings?.thinkingDisplay !== "hidden") && (state.apiSettings?.enableInnerMonologue !== false);
      if (isThinkingEnabled) {
        requestBody.reasoning = { effort: "medium" };
      }
    }
  }

  const startTime = Date.now();
  const headers = {
    "Content-Type": "application/json"
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (baseUrl && (baseUrl.includes("ngrok") || baseUrl.includes("ngrok-free.dev") || baseUrl.includes("ngrok.io"))) {
    headers["ngrok-skip-browser-warning"] = "true";
  }

  return await withRetry(async () => {
    let response;
    try {
      response = await fetchWithTimeout(
        completionsUrl,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal
        },
        timeoutMs
      );
      if (!response.ok) {
        const text = await response.text();
        throw normalizeErrorStatus(response.status, text, response.headers);
      }
    } catch (err) {
      if (err.message && (err.message.includes("support image input") || err.message.includes("image input"))) {
        console.warn("[API] Model does not support images. Stripping images and retrying...");
        requestBody.messages = stripImagesFromMessages(messages);
        response = await fetchWithTimeout(
          completionsUrl,
          {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal
          },
          timeoutMs
        );
        if (!response.ok) {
          const text = await response.text();
          throw normalizeErrorStatus(response.status, text, response.headers);
        }
      } else {
        throw err;
      }
    }

    if (!response.body) {
      return await sendMessageNonStream({ apiKey, baseUrl, model, messages, temperature, maxTokens, repetitionPenalty, presencePenalty, frequencyPenalty, topP, minP, signal, timeoutMs, enableThinking, apiProvider: provider });
    }

    const reader = response.body.getReader();
    let aggregated = "";
    let aggregatedReasoning = "";
    try {
      const decoder = new TextDecoder("utf-8");
      let sseBuffer = "";
      let usage = null;

      const handleChunk = (parsed) => {
        if (!parsed) return;
        if (parsed?.error) {
          const err = normalizeErrorStatus(parsed.error.code || 429, JSON.stringify(parsed.error));
          err.isApiError = true;
          throw err;
        }
        if (parsed?.usage) {
          usage = parsed.usage;
          return;
        }
        if (isKobold) {
          let token = "";
          if (parsed?.token !== undefined) {
            token = parsed.token;
          } else if (parsed?.results?.[0]?.text !== undefined) {
            token = parsed.results[0].text;
          }
          if (token) {
            aggregated += token;
            if (onToken) onToken(buildCombinedText(aggregatedReasoning, aggregated), token);
          }
        } else {
          const delta = parsed?.choices?.[0]?.delta;
          
          const reasoningToken = extractReasoningText(delta) || extractReasoningText(parsed?.choices?.[0]);
          if (reasoningToken) {
            aggregatedReasoning += reasoningToken;
          }

          const contentToken = delta?.content ?? "";
          if (contentToken) {
            aggregated += contentToken;
          }

          if (reasoningToken || contentToken) {
            if (onToken) onToken(buildCombinedText(aggregatedReasoning, aggregated), contentToken || reasoningToken);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        sseBuffer = parseSSEBuffer(sseBuffer, (dataLine) => {
          if (dataLine === "[DONE]") return;
          try {
            handleChunk(JSON.parse(dataLine));
          } catch (err) {
            if (err.isApiError || err.isRateLimit) throw err;
            // Ignore malformed streaming chunks.
          }
        });
      }

      // Flush remaining buffer
      if (sseBuffer.trim()) {
        const normalized = sseBuffer.replace(/\r\n/g, "\n");
        const lines = normalized
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);
        for (const dataLine of lines) {
          if (dataLine === "[DONE]") continue;
          try {
            handleChunk(JSON.parse(dataLine));
          } catch (err) {
            if (err.isApiError || err.isRateLimit) throw err;
            // Ignore malformed streaming chunks.
          }
        }
      }

      const responseText = buildCombinedText(aggregatedReasoning, aggregated).trim();
      const latencyMs = Date.now() - startTime;

      if (!usage) {
        const totalPromptChars = messages.reduce((acc, m) => acc + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content || "").length), 0);
        const estPromptTokens = Math.max(1, Math.round(totalPromptChars / 3.3));
        const estCompletionTokens = Math.max(1, Math.round((responseText || "").length / 3.3));
        usage = {
          prompt_tokens: estPromptTokens,
          completion_tokens: estCompletionTokens,
          total_tokens: estPromptTokens + estCompletionTokens,
          is_estimated: true
        };
      }

      if (typeof document !== "undefined") {
        document.dispatchEvent(new CustomEvent("openrouter-api-log", {
          detail: { type: "stream", model, messages, responseText, latencyMs, timestamp: startTime, usage }
        }));
      }
      return responseText;
    } catch (err) {
      try {
        await reader.cancel();
      } catch (_) {}
      const partialText = buildCombinedText(aggregatedReasoning, aggregated).trim();
      if (partialText && partialText.length > 0) {
        console.warn("[Stream] Stream ended with partial content. Retaining streamed text without generating a second message.");
        return partialText;
      }
      throw err;
    } finally {
      reader.releaseLock();
    }
  }, { signal, onRetry, model });
}

export async function sendMessageNonStream({
  apiKey,
  model,
  messages,
  temperature,
  maxTokens,
  repetitionPenalty,
  presencePenalty,
  frequencyPenalty,
  topP,
  minP,
  onRetry,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  baseUrl,
  enableThinking = true,
  apiProvider
}) {
  const provider = apiProvider || state.apiSettings.apiProvider || "openrouter";
  const isKobold = provider === "kobold";

  let completionsUrl;
  let requestBody;
  const effectiveBaseUrl = (baseUrl || state.apiSettings?.localBaseUrl || "http://localhost:5000").replace(/\/+$/, "");
  if (isKobold) {
    completionsUrl = `${effectiveBaseUrl}/api/v1/generate`;
    requestBody = {
      prompt: formatMessagesForKobold(messages),
      temperature: temperature ?? 0.7,
      max_length: maxTokens ?? 512,
      top_p: topP ?? 1.0,
      min_p: minP ?? 0.0,
      rep_pen: repetitionPenalty ?? 1.0
    };
  } else {
    const processedMessages = messages;
    completionsUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/chat/completions` : OPENROUTER_URL;
    requestBody = {
      model,
      messages: processedMessages,
      stream: false,
      temperature: temperature ?? 0.7,
      max_tokens: enableThinking ? Math.max(3000, (maxTokens || 1000) * 2) : (maxTokens || 1000)
    };
    if (repetitionPenalty !== undefined && repetitionPenalty !== null) requestBody.repetition_penalty = repetitionPenalty;
    if (frequencyPenalty !== undefined && frequencyPenalty !== null) requestBody.frequency_penalty = frequencyPenalty;
    if (presencePenalty !== undefined && presencePenalty !== null) requestBody.presence_penalty = presencePenalty;
    if (topP !== undefined && topP !== null) requestBody.top_p = topP;
    if (minP !== undefined && minP !== null) requestBody.min_p = minP;
    if (!baseUrl) {
      const providerRouting = buildProviderRoutingConfig();
      if (providerRouting) {
        requestBody.provider = providerRouting;
      }
      const isThinkingEnabled = enableThinking && (state.apiSettings?.thinkingDisplay !== "hidden") && (state.apiSettings?.enableInnerMonologue !== false);
      if (isThinkingEnabled) {
        requestBody.include_reasoning = true;
        requestBody.reasoning = { effort: "medium" };
      } else {
        requestBody.chat_template_kwargs = { enable_thinking: false };
        requestBody.reasoning = { exclude: true };
      }
    } else {
      const isThinkingEnabled = enableThinking && (state.apiSettings?.thinkingDisplay !== "hidden") && (state.apiSettings?.enableInnerMonologue !== false);
      if (isThinkingEnabled) {
        requestBody.reasoning = { effort: "medium" };
      }
    }
  }

  const startTime = Date.now();
  const headers = {
    "Content-Type": "application/json"
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (baseUrl && (baseUrl.includes("ngrok") || baseUrl.includes("ngrok-free.dev") || baseUrl.includes("ngrok.io"))) {
    headers["ngrok-skip-browser-warning"] = "true";
  }

  console.log(`[API Request] Sending POST to ${completionsUrl} (timeout: ${timeoutMs}ms)`);
  return await withRetry(async () => {
    let response;
    try {
      response = await fetchWithTimeout(
        completionsUrl,
        {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal
        },
        timeoutMs
      );
      if (!response.ok) {
        const text = await response.text();
        throw normalizeErrorStatus(response.status, text, response.headers);
      }
    } catch (err) {
      if (err.message && (err.message.includes("support image input") || err.message.includes("image input"))) {
        console.warn("[API] Model does not support images. Stripping images and retrying...");
        requestBody.messages = stripImagesFromMessages(messages);
        response = await fetchWithTimeout(
          completionsUrl,
          {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody),
            signal
          },
          timeoutMs
        );
        if (!response.ok) {
          const text = await response.text();
          throw normalizeErrorStatus(response.status, text, response.headers);
        }
      } else {
        throw err;
      }
    }

    const data = await response.json();
    if (data?.error) {
      throw normalizeErrorStatus(data.error.code || 429, JSON.stringify(data.error));
    }
    let responseText = "";
    if (isKobold) {
      responseText = data?.results?.[0]?.text?.trim() || "";
    } else {
      const msgObj = data?.choices?.[0]?.message;
      const reasoningText = extractReasoningText(msgObj) || extractReasoningText(data?.choices?.[0]) || extractReasoningText(data);
      const mainContent = (msgObj?.content || data?.choices?.[0]?.text || "").trim();
      responseText = buildCombinedText(reasoningText, mainContent);
    }
    const latencyMs = Date.now() - startTime;
    let usage = data?.usage;
    if (!usage) {
      const totalPromptChars = messages.reduce((acc, m) => acc + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content || "").length), 0);
      const estPromptTokens = Math.max(1, Math.round(totalPromptChars / 3.3));
      const estCompletionTokens = Math.max(1, Math.round((responseText || "").length / 3.3));
      usage = {
        prompt_tokens: estPromptTokens,
        completion_tokens: estCompletionTokens,
        total_tokens: estPromptTokens + estCompletionTokens,
        is_estimated: true
      };
    }
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("openrouter-api-log", {
        detail: { type: "non-stream", model, messages, responseText, latencyMs, timestamp: startTime, usage }
      }));
    }
    return responseText;
  }, { signal, onRetry, model });
}

export async function fetchModels({ apiKey, baseUrl, signal, timeoutMs = 15000, provider }) {
  const activeProvider = provider || state.apiSettings.apiProvider || "openrouter";

  if (activeProvider === "kobold") {
    const effectiveBaseUrl = (baseUrl || state.apiSettings?.localBaseUrl || "http://localhost:5000").replace(/\/+$/, "");
    const url = `${effectiveBaseUrl}/api/v1/model`;
    const response = await withRetry(() => {
      return fetchWithTimeout(
        url,
        {
          method: "GET",
          signal
        },
        timeoutMs
      );
    });

    if (!response.ok) {
      const text = await response.text();
      throw normalizeErrorStatus(response.status, text);
    }

    const payload = await response.json();
    const modelName = payload?.result || "Kobold Model";
    return [{
      id: modelName,
      name: modelName,
      context_length: 8192,
      pricing: { prompt: "0", completion: "0" }
    }];
  }

  const url = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/models` : OPENROUTER_MODELS_URL;
  const headers = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  if (baseUrl && (baseUrl.includes("ngrok") || baseUrl.includes("ngrok-free.dev") || baseUrl.includes("ngrok.io"))) {
    headers["ngrok-skip-browser-warning"] = "true";
  }

  const response = await withRetry(() => {
    return fetchWithTimeout(
      url,
      {
        method: "GET",
        headers,
        signal
      },
      timeoutMs
    );
  });

  if (!response.ok) {
    const text = await response.text();
    throw normalizeErrorStatus(response.status, text);
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
  return models
    .filter((item) => item && item.id)
    .map((item) => ({
      id: item.id,
      name: item.name || item.id,
      context_length: Number(item.context_length) || 2048,
      pricing: item.pricing || { prompt: "0", completion: "0" }
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchModelEndpoints(modelId, { apiKey, signal, timeoutMs = 15000, forceRefresh = false } = {}) {
  if (!modelId || typeof modelId !== "string" || !modelId.trim()) {
    return [];
  }
  const cleanModelId = modelId.trim();

  // Return cached endpoints if available and not forcing refresh
  if (!forceRefresh && state.modelEndpointsCache && state.modelEndpointsCache[cleanModelId]) {
    const cached = state.modelEndpointsCache[cleanModelId];
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  }

  const effectiveApiKey = apiKey || loadApiKey();
  const headers = {};
  if (effectiveApiKey) {
    headers["Authorization"] = `Bearer ${effectiveApiKey}`;
  }

  const url = `https://openrouter.ai/api/v1/models/${cleanModelId}/endpoints`;

  try {
    const response = await withRetry(() => {
      return fetchWithTimeout(
        url,
        {
          method: "GET",
          headers,
          signal
        },
        timeoutMs
      );
    }, { signal, model: cleanModelId });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[OpenRouter] fetchModelEndpoints failed (${response.status}):`, text);
      return state.modelEndpointsCache?.[cleanModelId] || [];
    }

    const payload = await response.json();
    const endpointsRaw = Array.isArray(payload?.data?.endpoints)
      ? payload.data.endpoints
      : (Array.isArray(payload?.data) ? payload.data : []);

    const endpoints = endpointsRaw.map(ep => {
      const providerName = ep.provider_name || ep.name || ep.provider_slug || "Unknown";
      const promptPrice = ep.pricing?.prompt !== undefined && ep.pricing?.prompt !== null ? Number(ep.pricing.prompt) : null;
      const completionPrice = ep.pricing?.completion !== undefined && ep.pricing?.completion !== null ? Number(ep.pricing.completion) : null;
      
      return {
        providerName,
        name: ep.name || providerName,
        contextLength: Number(ep.context_length) || Number(payload?.data?.context_length) || 0,
        maxCompletionTokens: Number(ep.max_completion_tokens) || 0,
        promptPrice,
        completionPrice,
        quantization: ep.quantization || "",
        supportedParameters: Array.isArray(ep.supported_parameters) ? ep.supported_parameters : [],
        status: ep.status || 0
      };
    });

    if (endpoints.length > 0) {
      if (!state.modelEndpointsCache) state.modelEndpointsCache = {};
      state.modelEndpointsCache[cleanModelId] = endpoints;
      saveModelEndpointsCache(state.modelEndpointsCache);
    }

    return endpoints;
  } catch (error) {
    console.warn(`[OpenRouter] Failed to fetch endpoints for ${cleanModelId}:`, error);
    return state.modelEndpointsCache?.[cleanModelId] || [];
  }
}

export function getEffectiveModelPricing(modelId) {
  if (!modelId) return null;
  const metadata = state.modelsMetadata?.[modelId];
  let promptPrice = null;
  let completionPrice = null;
  let providerName = null;
  let isDiscounted = false;

  const endpoints = state.modelEndpointsCache?.[modelId];
  if (Array.isArray(endpoints) && endpoints.length > 0) {
    const specificProvider = state.apiSettings?.specificProvider;
    if (specificProvider) {
      const matched = endpoints.find(e => e.providerName?.toLowerCase() === specificProvider.toLowerCase());
      if (matched && matched.promptPrice !== null && matched.completionPrice !== null) {
        promptPrice = matched.promptPrice;
        completionPrice = matched.completionPrice;
        providerName = matched.providerName;
      }
    }
    if (promptPrice === null) {
      // Find lowest price among active endpoints (status === 0 or undefined)
      const activeEps = endpoints.filter(e => (e.status === 0 || e.status === undefined) && e.promptPrice !== null && e.completionPrice !== null);
      if (activeEps.length > 0) {
        activeEps.sort((a, b) => (a.promptPrice + a.completionPrice) - (b.promptPrice + b.completionPrice));
        promptPrice = activeEps[0].promptPrice;
        completionPrice = activeEps[0].completionPrice;
        providerName = activeEps[0].providerName;
        isDiscounted = true;
      }
    }
  }

  // Fallback to static model metadata if endpoints not loaded or empty
  if (promptPrice === null && metadata?.pricing) {
    promptPrice = parseFloat(metadata.pricing.prompt || 0);
    completionPrice = parseFloat(metadata.pricing.completion || 0);
  }

  return {
    promptPrice,
    completionPrice,
    providerName,
    isDiscounted
  };
}

export async function fetchOpenRouterCredits(apiKey) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    return null;
  }
  const cleanKey = apiKey.trim();
  try {
    const headers = { Authorization: `Bearer ${cleanKey}` };
    
    let totalCredits = null;
    let totalUsage = null;
    try {
      const resCredits = await fetch("https://openrouter.ai/api/v1/credits", { headers });
      if (resCredits.ok) {
        const json = await resCredits.json();
        totalCredits = json?.data?.total_credits ?? null;
        totalUsage = json?.data?.total_usage ?? null;
      }
    } catch (e) {
      // Ignore
    }

    let keyUsage = null;
    let keyLimit = null;
    let isFreeTier = false;
    let keyLabel = null;
    try {
      const resKey = await fetch("https://openrouter.ai/api/v1/auth/key", { headers });
      if (resKey.ok) {
        const json = await resKey.json();
        keyUsage = json?.data?.usage ?? null;
        keyLimit = json?.data?.limit ?? null;
        isFreeTier = json?.data?.is_free_tier ?? false;
        keyLabel = json?.data?.label ?? null;
      }
    } catch (e) {
      // Ignore
    }

    return {
      totalCredits,
      totalUsage,
      keyUsage,
      keyLimit,
      isFreeTier,
      keyLabel
    };
  } catch (e) {
    console.warn("[OpenRouter] Failed to fetch credits info:", e);
    return null;
  }
}

export async function translateMessageText(text, targetLang = "ru") {
  if (!text || !text.trim()) return text;
  
  const model = state.apiSettings.translationModel || state.apiSettings.selectedModel || "deepseek/deepseek-v4-flash";
  const apiKey = loadApiKey();

  const systemMessage = {
    role: "system",
    content: "You are a professional literary translator. Translate the given text into natural, high-quality Russian. Preserve dialogue formatting, quotes (\"...\"), character names, and asterisks (*action*). Output ONLY the direct Russian translation without any commentary, notes, or extra quotes around the whole text."
  };

  const userMessage = {
    role: "user",
    content: text
  };

  const responseText = await sendMessageNonStream({
    model,
    messages: [systemMessage, userMessage],
    apiKey,
    temperature: 0.3,
    maxTokens: 1500
  });

  return (responseText || "").trim();
}
