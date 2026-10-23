import { state } from "../js/state.js";
import { getActivePersona } from "./storage.js";
import { rerankMemoriesWithJev } from "./jevService.js";

// RAG Index Cache: chatId -> { chunks: Array<{ text, messageIndex, tokens, wordCount }>, avgLength, signature }
const ragIndexCache = new Map();

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
 * Drops stop words and applies light stemming (e.g. "амулет", "амулета", "амулетом" -> "амулет").
 */
function tokenize(text) {
  if (!text) return [];
  const words = text
    .toLowerCase()
    .replace(/[^\w\u0400-\u04FF\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  return words.map(w => {
    if (/[\u0400-\u04FF]/.test(w)) {
      return w.replace(/(ами|ями|ов|ев|ей|ам|ям|ах|ях|ом|ем|ой|ей|у|ю|а|я|е|и|ы|о)$/i, "");
    }
    return w.replace(/(ing|ed|es|s)$/i, "");
  }).filter(w => w.length >= 2);
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
  return `${chatSignature(chat)}|${getRawWindowSize()}|${getUserName()}|${resolveOwnerName(chatId)}`;
}

/**
 * Builds or retrieves the RAG index for a specific chat.
 * Indexes only messages outside the raw history window, as user+assistant pairs.
 */
export function buildRagIndex(chatId) {
  const chat = state.chats?.[chatId] || [];
  if (chat.length === 0) {
    ragIndexCache.delete(chatId);
    return null;
  }

  const pastMessages = getIndexableMessages(chat);
  if (pastMessages.length === 0) {
    ragIndexCache.delete(chatId);
    return null;
  }

  const userName = getUserName();
  const ownerName = resolveOwnerName(chatId);
  const chunks = [];
  let totalWords = 0;

  const pushChunk = (text, messageIndex) => {
    const tokens = tokenize(text);
    if (tokens.length === 0) return;
    chunks.push({ text, messageIndex, tokens, wordCount: tokens.length });
    totalWords += tokens.length;
  };

  for (let i = 0; i < pastMessages.length; i++) {
    const msg = pastMessages[i];
    const first = formatMessageLine(msg, ownerName, userName);
    if (!first) continue;

    let text = first;
    let end = i;
    const next = pastMessages[i + 1];
    if (msg.role === "user" && next && next.role === "assistant") {
      const second = formatMessageLine(next, ownerName, userName);
      if (second) {
        text = `${first}\n${second}`;
        end = i + 1;
      }
    }

    pushChunk(text, i + 1);
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
 * Fast candidate retrieval using BM25 scoring over indexed chunks.
 * Returns up to `limit` candidates for reranking.
 */
export function getCandidateMemories(chatId, queryText, limit = 6) {
  const chat = state.chats?.[chatId] || [];
  let indexData = ragIndexCache.get(chatId);
  if (!indexData || indexData.signature !== indexSignature(chat, chatId)) {
    indexData = buildRagIndex(chatId);
  }
  if (!indexData || !Array.isArray(indexData.chunks) || indexData.chunks.length === 0) {
    return [];
  }

  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) return [];

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

      const num = tf * (k1 + 1);
      const den = tf + k1 * (1 - b + b * (docLen / avgLength));
      score += idf * (num / den);
    }

    if (score > RAG_MIN_SCORE) {
      scoredChunks.push({ ...chunk, score });
    }
  }

  scoredChunks.sort((a, b) => b.score - a.score);
  return scoredChunks.slice(0, limit);
}

/**
 * Searches RAG memory for a user query using BM25 relevance scoring.
 * Synchronous version for backwards compatibility.
 * Returns topK most relevant past memory snippets.
 */
export function retrieveRelevantMemories(chatId, queryText, topK = 3) {
  const candidates = getCandidateMemories(chatId, queryText, topK);
  return candidates.slice(0, topK);
}

/**
 * Asynchronous smart RAG retrieval powered by TypeSafe Jev reranking.
 * 1. Pulls top candidates via fast BM25 search.
 * 2. Uses Jev model (~typesafe/jev-latest) via OpenRouter System One API to calibrate relevance.
 * 3. Returns only memories that pass the semantic relevance threshold.
 */
export async function retrieveRelevantMemoriesAsync(chatId, queryText, topK = 3, apiKey = null, options = {}) {
  const candidates = getCandidateMemories(chatId, queryText, RAG_CANDIDATE_POOL);
  if (candidates.length === 0) {
    return [];
  }

  if (!apiKey || !apiKey.trim()) {
    return candidates.slice(0, topK);
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

    // An empty array is a real verdict ("nothing relevant"), so it must not be
    // replaced by the lexical candidates. Reranker errors already return a
    // lexical fallback from rerankMemoriesWithJev itself.
    return Array.isArray(reranked) ? reranked : candidates.slice(0, topK);
  } catch (err) {
    console.warn("[RAG Service] Jev reranking failed, fallback to BM25:", err);
    return candidates.slice(0, topK);
  }
}

/**
 * Clears cached RAG index for a chat (used when clearing chat or reloading)
 */
export function clearRagIndex(chatId) {
  ragIndexCache.delete(chatId);
}
