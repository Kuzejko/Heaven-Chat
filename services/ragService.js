import { state } from "../js/state.js";
import { getActivePersona, getArchivedRagChunks, getSessionMemory } from "./storage.js";
import { rerankMemoriesWithJev } from "./jevService.js";
import { stemWord } from "../js/stemmer.js";

// RAG Index Cache: chatId -> { chunks: Array<{ text, messageIndex, tokens, wordCount }>, avgLength, signature }
const ragIndexCache = new Map();

// In-memory cache for async RAG results: key (${chatId}|${signature}|${query}) -> Array<memory>
const ragJevResultCache = new Map();
const MAX_RAG_RESULT_CACHE_SIZE = 10;

const STOP_WORDS = new Set([
  "и", "в", "во", "не", "что", "он", "на", "я", "с", "со", "как", "а", "то", "все", "она", "так",
  "его", "но", "да", "ты", "к", "у", "же", "вы", "за", "бы", "по", "только", "ее", "мне", "было",
  "вот", "от", "меня", "еще", "нет", "о", "из", "ему", "теперь", "когда", "даже", "ну", "вдруг",
  "ли", "если", "уже", "или", "ни", "быть", "был", "него", "до", "вас", "опять", "уж", "вам",
  "ведь", "там", "потом", "себя", "ничего", "ей", "может", "они", "тут", "где", "есть", "надо",
  "ней", "для", "мы", "тебя", "их", "чем", "была", "сам", "чтоб", "без", "будто", "чего", "раз",
  "тоже", "себе", "под", "будет", "тогда", "кто", "этот", "того", "потому", "этого", "какой",
  "совсем", "ним", "здесь", "этом", "один", "почти", "мой", "тем", "чтобы", "нее", "сейчас",
  "были", "куда", "зачем", "всех", "никогда", "можно", "при", "наконец", "два", "об", "другой",
  "хоть", "после", "над", "больше", "тот", "через", "эти", "нас", "про", "всего", "них", "какая",
  "много", "разве", "эту", "моя", "свою", "этой", "перед", "иногда", "лучше", "чуть", "том",
  "нельзя", "такой", "им", "более", "всегда", "конечно", "всю", "между",
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one",
  "our", "out", "has", "have", "with", "this", "that", "from", "they", "will", "would", "there",
  "their", "what", "about", "which", "when", "make", "like", "just", "into", "than", "them", "then",
  "some", "could", "other"
]);

const RAG_MIN_SCORE = 0.3;
const RAG_CANDIDATE_POOL = 6;

/**
 * Tokenizes Russian & English text into normalized word tokens.
 * Drops stop words, normalizes 'ё' -> 'е', and applies Snowball/Porter stemming.
 */
function tokenize(text) {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\w\u0400-\u04FF\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  return words.map(w => stemWord(w)).filter(w => w && w.length >= 2);
}

/**
 * Cheap content fingerprint of a chat, so the index is rebuilt when a message
 * is edited or regenerated even if the message count stays the same.
 */
function chatSignature(chat) {
  let hash = 2166136261;
  for (const msg of chat) {
    const text = `${msg.role}\u0001${msg.content || ""}\u0002`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${chat.length}:${hash >>> 0}`;
}

function getUserName() {
  return getActivePersona()?.userName || "User";
}

/**
 * Finds the owner (character or GM scene) of a chat and returns its display name.
 * chatMetadata[ownerId] holds the list of chats that belong to that owner.
 */
function resolveOwnerName(chatId) {
  for (const [ownerId, entries] of Object.entries(state.chatMetadata || {})) {
    if (!Array.isArray(entries) || !entries.some(e => e && e.id === chatId)) continue;
    const character = (state.characters || []).find(c => c.id === ownerId);
    if (character) return character.name;
    const scene = (state.gmScenes || []).find(s => s.id === ownerId);
    if (scene) return "Narrator";
  }
  return "Character";
}

function speakerLabel(msg, ownerName, userName) {
  if (msg.role === "user") return userName;
  if (msg.characterId) {
    const char = (state.characters || []).find(c => c.id === msg.characterId);
    if (char) return char.name;
  }
  return ownerName;
}

/**
 * Renders one message as "Speaker: text". Assistant messages in GM scenes carry a
 * "[CHARACTER: Name]" tag, which is used as the speaker and removed from the text.
 */
function formatMessageLine(msg, ownerName, userName) {
  let content = (msg.content || "")
    .replace(/<thought[\s\S]*?<\/thought>/gi, "")
    .replace(/<thought[\s\S]*/gi, "")
    .trim();

  let speaker = speakerLabel(msg, ownerName, userName);
  const tag = content.match(/^\[CHARACTER:\s*([^\]]+)\]\s*/);
  if (msg.role === "assistant" && tag) {
    speaker = tag[1].trim();
    content = content.slice(tag[0].length).trim();
  }

  if (!content) return null;
  return `${speaker}: ${content}`;
}

/**
 * Number of most recent messages that are already sent as raw history
 * (promptBuilder uses maxHistoryMessages; 0 means the whole chat is sent).
 */
function getRawWindowSize() {
  const max = Number(state.apiSettings?.maxHistoryMessages ?? 20);
  return max > 0 ? max : Infinity;
}

function getIndexableMessages(chat) {
  const window = getRawWindowSize();
  let liveLength = chat.length;
  const last = chat[chat.length - 1];
  if (last && last.role === "assistant" && !last.content) liveLength--;
  return chat.slice(0, Math.max(0, liveLength - window));
}

function indexSignature(chat, chatId) {
  const archCount = (getArchivedRagChunks(chatId) || []).length;
  const loc = (getSessionMemory(chatId)?.setting?.location || "").trim();
  return `${chatSignature(chat)}|${getRawWindowSize()}|${getUserName()}|${resolveOwnerName(chatId)}|arch:${archCount}|loc:${loc}`;
}

/**
 * Builds or retrieves the RAG index for a specific chat.
 * Indexes archived chunks from evicted history as well as messages outside the raw history window.
 */
export function buildRagIndex(chatId) {
  const chat = state.chats?.[chatId] || [];
  const archivedChunks = getArchivedRagChunks(chatId) || [];
  if (chat.length === 0 && archivedChunks.length === 0) {
    ragIndexCache.delete(chatId);
    return null;
  }

  const pastMessages = getIndexableMessages(chat);
  if (pastMessages.length === 0 && archivedChunks.length === 0) {
    ragIndexCache.delete(chatId);
    return null;
  }

  const sessionMem = getSessionMemory(chatId);
  const locationTag = (sessionMem?.setting?.location || "").trim();

  const userName = getUserName();
  const ownerName = resolveOwnerName(chatId);
  const chunks = [];
  let totalWords = 0;

  const pushChunk = (text, messageIndex) => {
    let finalText = text;
    if (locationTag && !finalText.startsWith("[")) {
      finalText = `[Локация: ${locationTag}]\n${finalText}`;
    }
    const tokens = tokenize(finalText);
    if (tokens.length === 0) return;
    chunks.push({ text: finalText, messageIndex, tokens, wordCount: tokens.length });
    totalWords += tokens.length;
  };

  // 1. Index archived pairs from evicted history
  for (const ac of archivedChunks) {
    if (ac && ac.text) {
      pushChunk(ac.text, ac.messageIndex || 0);
    }
  }

  // 2. Index messages from current active history outside the raw window
  for (let i = 0; i < pastMessages.length; i++) {
    const msg = pastMessages[i];
    const first = formatMessageLine(msg, ownerName, userName);
    if (!first) continue;

    let text = first;
    let end = i;
    const messageIdx = (typeof msg.seq === "number") ? msg.seq : (i + 1);
    const next = pastMessages[i + 1];
    if (msg.role === "user" && next && next.role === "assistant") {
      const second = formatMessageLine(next, ownerName, userName);
      if (second) {
        text = `${first}\n${second}`;
        end = i + 1;
      }
    }

    pushChunk(text, messageIdx);
    i = end;
  }

  const chatMeta = state.chatMetadata?.[chatId] || {};
  const worldLore = chatMeta.worldLore || {};

  const categories = [
    { key: "locations", title: "🏰 Локация" },
    { key: "rules", title: "🔮 Правило мира/магии" },
    { key: "factions", title: "🛡️ Фракция" },
    { key: "items", title: "🗡️ Артефакт" }
  ];

  categories.forEach(cat => {
    const items = worldLore[cat.key];
    if (Array.isArray(items)) {
      items.forEach(item => {
        const name = typeof item === "string" ? item : (item.name || "");
        const desc = typeof item === "string" ? "" : (item.description || "");
        if (name || desc) {
          pushChunk(`[Энциклопедия Мира — ${cat.title}: ${name}]: ${desc}`, "Лор Мира");
        }
      });
    } else if (typeof items === "string" && items.trim()) {
      pushChunk(`[Энциклопедия Мира — ${cat.title}]: ${items.trim()}`, "Лор Мира");
    }
  });

  const indexData = {
    chunks,
    avgLength: chunks.length > 0 ? totalWords / chunks.length : 1,
    signature: indexSignature(chat, chatId)
  };
  ragIndexCache.set(chatId, indexData);
  return indexData;
}

/**
 * Fast candidate retrieval using weighted BM25 scoring over indexed chunks.
 * Tokens from userInput are boosted x2.5; recent history tokens have weight x1.0.
 * A +25% bonus is awarded if the chunk contains bigrams from userInput or rare proper nouns.
 * Returns up to `limit` candidates for reranking.
 */
export function getCandidateMemories(chatId, queryText, limit = 6, options = {}) {
  const chat = state.chats?.[chatId] || [];
  let indexData = ragIndexCache.get(chatId);
  if (!indexData || indexData.signature !== indexSignature(chat, chatId)) {
    indexData = buildRagIndex(chatId);
  }
  if (!indexData || !Array.isArray(indexData.chunks) || indexData.chunks.length === 0) {
    return [];
  }

  // 1. Determine user input and history query
  let rawUserInput = typeof options.userInput === "string" ? options.userInput : "";
  if (!rawUserInput) {
    if (chat.length > 0 && chat[chat.length - 1].role === "user") {
      rawUserInput = chat[chat.length - 1].content || "";
    } else if (chat.length >= 2 && chat[chat.length - 2].role === "user") {
      rawUserInput = chat[chat.length - 2].content || "";
    } else {
      rawUserInput = queryText;
    }
  }

  // Clean thoughts from history text
  const cleanThoughts = (t) => (t || "")
    .replace(/<(think|thought|thinking|reasoning|reflection|details)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/\[(think|thought|thinking|reasoning|reflection)\][\s\S]*?\[\/\1\]/gi, "");

  const userTokens = tokenize(rawUserInput);
  const tokenWeights = new Map();
  userTokens.forEach(t => tokenWeights.set(t, 2.5));

  // Recent history tokens (recentChat.slice(-2))
  const recentMsgs = chat.slice(-2);
  const historyText = cleanThoughts(recentMsgs.map(m => m.content).join(" "));
  const histTokens = tokenize(historyText);
  histTokens.forEach(t => {
    if (!tokenWeights.has(t)) {
      tokenWeights.set(t, 1.0);
    }
  });

  // Also include any other tokens from queryText at 1.0
  const allQueryTokens = tokenize(cleanThoughts(queryText));
  allQueryTokens.forEach(t => {
    if (!tokenWeights.has(t)) {
      tokenWeights.set(t, 1.0);
    }
  });

  const queryTokens = Array.from(tokenWeights.keys());
  if (queryTokens.length === 0) return [];

  // Bigram tokens from userInput for bonus check
  const userBigrams = [];
  if (userTokens.length >= 2) {
    for (let i = 0; i < userTokens.length - 1; i++) {
      userBigrams.push(`${userTokens[i]} ${userTokens[i + 1]}`);
    }
  }

  // Proper nouns in rawUserInput: words starting with uppercase
  const properNouns = (rawUserInput.match(/[А-ЯA-Z][а-яa-z]{2,}/g) || []).map(w => stemWord(w.toLowerCase()));

  const k1 = 1.5;
  const b = 0.75;
  const { chunks, avgLength } = indexData;
  const N = chunks.length;

  const df = {};
  for (const qToken of queryTokens) {
    let count = 0;
    for (const chunk of chunks) {
      if (chunk.tokens.includes(qToken)) count++;
    }
    df[qToken] = count;
  }

  const scoredChunks = [];
  for (const chunk of chunks) {
    let score = 0;
    const docLen = chunk.wordCount;

    for (const qToken of queryTokens) {
      const docFreq = df[qToken] || 0;
      if (docFreq === 0) continue;

      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
      const tf = chunk.tokens.filter(t => t === qToken).length;
      if (tf === 0) continue;

      const weight = tokenWeights.get(qToken) || 1.0;
      const num = tf * (k1 + 1);
      const den = tf + k1 * (1 - b + b * (docLen / avgLength));
      score += idf * (num / den) * weight;
    }

    // +25% bonus if chunk contains 2+ consecutive tokens from userInput (bigram) or rare proper noun
    let hasBigram = false;
    if (userBigrams.length > 0 && chunk.tokens.length >= 2) {
      const chunkTokenStr = chunk.tokens.join(" ");
      for (const bg of userBigrams) {
        if (chunkTokenStr.includes(bg)) {
          hasBigram = true;
          break;
        }
      }
    }

    let hasProperNoun = false;
    if (properNouns.length > 0) {
      for (const pn of properNouns) {
        if (chunk.tokens.includes(pn)) {
          hasProperNoun = true;
          break;
        }
      }
    }

    if (hasBigram || hasProperNoun) {
      score *= 1.25;
    }

    if (score > RAG_MIN_SCORE) {
      scoredChunks.push({ ...chunk, score });
    }
  }

  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, limit);
}

/**
 * Enriches retrieved chunks with preceding turn context if the previous chunk was omitted
 * but belongs to a neighbouring turn (c.messageIndex - prevChunk.messageIndex <= 2).
 */
export function enrichChunksWithPrecedingContext(selectedChunks, allChunks) {
  if (!Array.isArray(selectedChunks) || selectedChunks.length === 0 || !Array.isArray(allChunks) || allChunks.length === 0) {
    return selectedChunks;
  }
  const selectedSet = new Set(selectedChunks.map(c => c.text));

  return selectedChunks.map(c => {
    const idx = allChunks.findIndex(item => item === c || item.text === c.text);
    if (idx > 0) {
      const prevChunk = allChunks[idx - 1];
      if (
        prevChunk &&
        !selectedSet.has(prevChunk.text) &&
        typeof c.messageIndex === "number" &&
        typeof prevChunk.messageIndex === "number" &&
        c.messageIndex - prevChunk.messageIndex > 0 &&
        c.messageIndex - prevChunk.messageIndex <= 2
      ) {
        const lines = prevChunk.text.split("\n").map(l => l.trim()).filter(Boolean);
        const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
        if (lastLine) {
          const snippet = lastLine.length > 120 ? lastLine.slice(0, 117) + "..." : lastLine;
          return {
            ...c,
            text: `[Контекст перед этим: ${snippet}]\n${c.text}`
          };
        }
      }
    }
    return c;
  });
}

/**
 * Searches RAG memory for a user query using BM25 relevance scoring.
 * Synchronous version for backwards compatibility.
 * Returns topK most relevant past memory snippets.
 */
export function retrieveRelevantMemories(chatId, queryText, topK = 3, options = {}) {
  const candidates = getCandidateMemories(chatId, queryText, topK, options);
  const sliced = candidates.slice(0, topK);
  const indexData = ragIndexCache.get(chatId);
  return enrichChunksWithPrecedingContext(sliced, indexData?.chunks || []);
}

/**
 * Asynchronous smart RAG retrieval powered by TypeSafe Jev reranking and in-memory caching.
 * 1. Checks memory cache by chatId + indexSignature + query.
 * 2. Pulls top candidates via weighted BM25 search.
 * 3. Uses Jev model via System One API to calibrate relevance.
 * 4. Caches result (up to 10 entries) and returns relevant memories.
 */
export async function retrieveRelevantMemoriesAsync(chatId, queryText, topK = 3, apiKey = null, options = {}) {
  const chat = state.chats?.[chatId] || [];
  let indexData = ragIndexCache.get(chatId);
  if (!indexData || indexData.signature !== indexSignature(chat, chatId)) {
    indexData = buildRagIndex(chatId);
  }
  const signature = indexData?.signature || "0";
  const cacheKey = `${chatId}|${signature}|${queryText.trim()}`;

  if (ragJevResultCache.has(cacheKey)) {
    return ragJevResultCache.get(cacheKey);
  }

  const candidates = getCandidateMemories(chatId, queryText, RAG_CANDIDATE_POOL, options);
  if (candidates.length === 0) {
    return [];
  }

  if (!apiKey || !apiKey.trim()) {
    const rawRes = candidates.slice(0, topK);
    const res = enrichChunksWithPrecedingContext(rawRes, indexData?.chunks || []);
    ragJevResultCache.set(cacheKey, res);
    return res;
  }

  try {
    const reranked = await rerankMemoriesWithJev({
      apiKey,
      baseUrl: options?.baseUrl,
      apiProvider: options?.apiProvider,
      model: options?.model,
      currentContext: queryText,
      candidateChunks: candidates,
      threshold: 0.55,
      topK
    });

    const rawResult = Array.isArray(reranked) ? reranked : candidates.slice(0, topK);
    const result = enrichChunksWithPrecedingContext(rawResult, indexData?.chunks || []);
    if (ragJevResultCache.size >= MAX_RAG_RESULT_CACHE_SIZE) {
      const oldestKey = ragJevResultCache.keys().next().value;
      ragJevResultCache.delete(oldestKey);
    }
    ragJevResultCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("[RAG Service] Jev reranking failed, fallback to BM25:", err);
    return enrichChunksWithPrecedingContext(candidates.slice(0, topK), indexData?.chunks || []);
  }
}

/**
 * Clears cached RAG index and result cache for a chat (used when clearing chat or reloading)
 */
export function clearRagIndex(chatId) {
  ragIndexCache.delete(chatId);
  for (const key of ragJevResultCache.keys()) {
    if (key.startsWith(`${chatId}|`)) {
      ragJevResultCache.delete(key);
    }
  }
}

export { ragJevResultCache };
