/**
 * services/chubService.js
 * Service for querying and downloading character cards from Chub AI / CharacterHub.
 * Features automatic fallback between direct client-side fetch and server.js proxy.
 */

/**
 * Parses any Chub URL or path into a standardized 'author/slug' fullPath.
 * Examples:
 * - https://chub.ai/characters/Anonymous/alice-89fca9a6 -> Anonymous/alice-89fca9a6
 * - https://characterhub.org/characters/Author/Cool-Bot -> Author/Cool-Bot
 * - Author/Cool-Bot -> Author/Cool-Bot
 */
export function parseChubUrl(input) {
  if (!input || typeof input !== "string") return null;
  const clean = input.trim();

  // Pattern 1: URL with chub.ai/characters/... or characterhub.org/characters/...
  const urlMatch = clean.match(/(?:chub\.(?:ai|org)|characterhub\.org)\/characters\/([^\/\?#\s]+\/[^\/\?#\s]+)/i);
  if (urlMatch && urlMatch[1]) {
    return decodeURIComponent(urlMatch[1]);
  }

  // Pattern 2: Raw author/slug (e.g. Anonymous/alice-89fca9a6)
  const pathMatch = clean.match(/^([a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+)$/);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  return null;
}

/**
 * Searches Chub AI characters with sorting and tag filtering.
 * Tries direct browser fetch first; on CORS/network failure falls back to local server.js proxy.
 */
export async function searchChub({
  search = "",
  page = 1,
  first = 20,
  sort = "starCount",
  asc = false,
  topics = "",
  nsfw = false
} = {}) {
  const sortMap = {
    starCount: "star_count",
    lastActivityAt: "last_activity_at",
    createdAt: "created_at"
  };
  const normalizedSort = sortMap[sort] || sort || "star_count";

  const queryParams = new URLSearchParams({
    search: search.trim(),
    page: String(page),
    first: String(first),
    sort: normalizedSort,
    asc: String(asc),
    nsfw: String(nsfw)
  });
  if (topics && topics.trim()) {
    queryParams.set("topics", topics.trim());
  }

  const directUrl = `https://api.chub.ai/search?${queryParams.toString()}`;
  const proxyUrl = `/api/chub/search?${queryParams.toString()}`;

  // Try direct browser fetch first
  try {
    const directRes = await fetch(directUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (directRes.ok) {
      const json = await directRes.json();
      return formatChubSearchResponse(json);
    }
  } catch (_e) {
    // Expected if browser enforces strict CORS or CF challenge; fallback to proxy
  }

  // Fallback to local server.js proxy
  try {
    const proxyRes = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!proxyRes.ok) {
      throw new Error(`Ошибка сервера прокси Chub: статус ${proxyRes.status}`);
    }

    const json = await proxyRes.json();
    return formatChubSearchResponse(json);
  } catch (err) {
    console.error("[ChubService] Search failed both direct and proxy:", err);
    throw new Error(`Не удалось выполнить поиск в каталоге Chub: ${err.message}`);
  }
}

function formatChubSearchResponse(json) {
  const data = json.data || json;
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const count = typeof data.count === "number" ? data.count : nodes.length;

  return {
    count,
    nodes: nodes.map(node => ({
      id: node.id,
      name: node.name || "Без имени",
      fullPath: node.fullPath || "",
      author: node.fullPath ? node.fullPath.split("/")[0] : "Автор",
      tagline: node.tagline || node.description?.slice(0, 140) || "Нет описания",
      description: node.description || "",
      starCount: node.starCount || 0,
      nChats: node.nChats || 0,
      nTokens: node.nTokens || 0,
      avatarUrl: node.avatar_url || node.max_res_url || "",
      maxResUrl: node.max_res_url || "",
      topics: Array.isArray(node.topics) ? node.topics : [],
      createdAt: node.createdAt,
      lastActivityAt: node.lastActivityAt
    }))
  };
}

/**
 * Fetches character details and definition JSON for a given fullPath.
 */
export async function fetchChubCharacterDetails(fullPath) {
  if (!fullPath) {
    throw new Error("Не указан идентификатор карточки (fullPath).");
  }

  const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, "/");
  const directUrl = `https://api.chub.ai/api/characters/${encodedPath}?full=true`;
  const proxyUrl = `/api/chub/card?fullPath=${encodeURIComponent(fullPath)}`;

  // Try direct browser fetch first
  try {
    const directRes = await fetch(directUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (directRes.ok) {
      const json = await directRes.json();
      if (json && json.node) {
        return json;
      }
    }
  } catch (_e) {
    // Fallback to proxy
  }

  // Fallback to local server proxy
  try {
    const proxyRes = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!proxyRes.ok) {
      throw new Error(`Карточка не найдена на сервере Chub (код ${proxyRes.status})`);
    }

    const json = await proxyRes.json();
    if (json && json.node) {
      return json;
    }
    throw new Error("Некорректный формат ответа от Chub API.");
  } catch (err) {
    console.error("[ChubService] Failed to fetch character details:", err);
    throw new Error(`Не удалось загрузить данные карточки: ${err.message}`);
  }
}

/**
 * Converts Chub character API response (node + definition) into Heaven Chat standardized rawCard.
 */
export function convertChubToRawCard(chubDetails) {
  const node = chubDetails.node || chubDetails;
  const def = node.definition || {};

  // Avatar resolution
  const avatarUrl = def.avatar || node.avatar_url || node.max_res_url || "";

  // Extract Lorebook / World Info entries
  const lorebookEntries = [];
  const rawLorebook = def.embedded_lorebook || def.lorebook || node.character_book;
  if (rawLorebook && Array.isArray(rawLorebook.entries)) {
    rawLorebook.entries.forEach(entry => {
      let keysStr = "";
      if (Array.isArray(entry.keys)) {
        keysStr = entry.keys.join(", ");
      } else if (typeof entry.keys === "string") {
        keysStr = entry.keys;
      } else if (Array.isArray(entry.key)) {
        keysStr = entry.key.join(", ");
      } else if (typeof entry.key === "string") {
        keysStr = entry.key;
      }

      const content = entry.content || entry.entry || "";
      if (keysStr || content) {
        lorebookEntries.push({
          name: entry.name || entry.comment || "Лорбук",
          keys: keysStr,
          content: content,
          enabled: entry.enabled !== false
        });
      }
    });
  }

  // Alternate Greetings
  const altGreetings = Array.isArray(def.alternate_greetings)
    ? def.alternate_greetings.filter(g => typeof g === "string" && g.trim())
    : [];

  // Tags
  let tags = [];
  if (Array.isArray(node.topics)) {
    tags = node.topics;
  } else if (Array.isArray(def.tags)) {
    tags = def.tags;
  }

  const rawCard = {
    name: def.name || node.name || "Персонаж Chub",
    description: def.description || node.tagline || node.description || "",
    personality: def.personality || def.tavern_personality || "",
    scenario: def.scenario || "",
    firstMessage: def.first_message || def.first_mes || "",
    exampleDialogs: def.example_dialogs || def.mes_example || "",
    systemPrompt: def.system_prompt || "",
    postHistoryInstructions: def.post_history_instructions || "",
    alternateGreetings: altGreetings,
    tags: tags,
    lorebook: lorebookEntries,
    avatarUrl: avatarUrl,
    formatVersion: "chub_definition",
    rawSource: chubDetails
  };

  return rawCard;
}
