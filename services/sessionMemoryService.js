import { sendMessageNonStream } from "./openrouter.js";
import { getEffectiveApiConfig } from "./apiHelper.js";
import { state } from "../js/state.js";
import { dom } from "../js/ui.js";
import { getActivePersona } from "./storage.js";

export const MEMORY_LIMITS = {
  listItems: 15,
  recentEvents: 8,
  keyEventsStored: 30,
  keyEventsInPrompt: 10,
  unresolvedThreads: 12
};

const capList = (list, max) => (list.length > max ? list.slice(-max) : list);

/**
 * Default empty structured memory schema matching the Python MemorySchema model.
 */
export function createDefaultSessionMemory() {
  return {
    setting: {
      location: "",
      time: "",
      atmosphere: "",
      world_rules: []
    },
    characters: {},
    key_events: [],
    unresolved_threads: [],
    intimate_notes: {
      dynamics: "",
      boundaries: [],
      preferences: [],
      recent_events: []
    },
    current_status: "",
    last_updated_message_id: null
  };
}

/**
 * Formats a structured memory object into clean, compact Markdown for LLM prompt injection.
 * Exactly corresponds to MemorySchema.to_markdown() in memory_system/models.py.
 */
export function formatMemoryToMarkdown(memory) {
  if (!memory) return "";

  const lines = ["# 🧠 STRUCTURED MEMORY CONTEXT"];

  // 1. Setting & Atmosphere
  const s = memory.setting || {};
  if (s.location || s.time || s.atmosphere || (Array.isArray(s.world_rules) && s.world_rules.length > 0)) {
    lines.push("\n## 📍 Setting & Atmosphere");
    if (s.location) lines.push(`- **Location**: ${s.location}`);
    if (s.time) lines.push(`- **Time**: ${s.time}`);
    if (s.atmosphere) lines.push(`- **Atmosphere**: ${s.atmosphere}`);
    if (Array.isArray(s.world_rules) && s.world_rules.length > 0) {
      lines.push(`- **World Rules**: ${s.world_rules.join(", ")}`);
    }
  }

  // 2. Current Situation
  if (memory.current_status && memory.current_status.trim()) {
    lines.push(`\n## ⚡ Current Situation\n${memory.current_status.trim()}`);
  }

  // 3. Characters & Relationships
  const chars = memory.characters || {};
  const charKeys = Object.keys(chars);
  if (charKeys.length > 0) {
    lines.push("\n## 👥 Character States & Relationships");
    for (const name of charKeys) {
      const c = chars[name] || {};
      lines.push(`### ${name}`);
      if (c.physical_state) lines.push(`- **Physical**: ${c.physical_state}`);
      if (c.emotional_state) lines.push(`- **Emotional**: ${c.emotional_state}`);
      if (c.relationships && typeof c.relationships === "object" && Object.keys(c.relationships).length > 0) {
        const relStr = Object.entries(c.relationships)
          .map(([target, rel]) => `${target}: ${rel}`)
          .join("; ");
        lines.push(`- **Relationships**: ${relStr}`);
      }
      if (Array.isArray(c.goals) && c.goals.length > 0) {
        lines.push(`- **Goals**: ${c.goals.join(", ")}`);
      }
      if (Array.isArray(c.important_traits) && c.important_traits.length > 0) {
        lines.push(`- **Traits**: ${c.important_traits.join(", ")}`);
      }
      if (c.notes) lines.push(`- **Notes**: ${c.notes}`);
    }
  }

  // 4. Intimate & Relationship Dynamics
  const im = memory.intimate_notes || {};
  if (
    im.dynamics ||
    (Array.isArray(im.boundaries) && im.boundaries.length > 0) ||
    (Array.isArray(im.preferences) && im.preferences.length > 0) ||
    (Array.isArray(im.recent_events) && im.recent_events.length > 0)
  ) {
    lines.push("\n## 💖 Intimate & Relationship Dynamics");
    if (im.dynamics) lines.push(`- **Dynamics**: ${im.dynamics}`);
    if (Array.isArray(im.boundaries) && im.boundaries.length > 0) {
      lines.push(`- **Boundaries**: ${im.boundaries.join(", ")}`);
    }
    if (Array.isArray(im.preferences) && im.preferences.length > 0) {
      lines.push(`- **Preferences**: ${im.preferences.join(", ")}`);
    }
    if (Array.isArray(im.recent_events) && im.recent_events.length > 0) {
      lines.push(`- **Recent Highlights**: ${im.recent_events.join("; ")}`);
    }
  }

  // 5. Unresolved Plot Threads & Promises
  if (Array.isArray(memory.unresolved_threads) && memory.unresolved_threads.length > 0) {
    lines.push("\n## 📌 Unresolved Plot Threads & Promises");
    for (const thread of memory.unresolved_threads) {
      if (thread && thread.trim()) {
        lines.push(`- ${thread.trim()}`);
      }
    }
  }

  // 6. Key Story Events (Recent up to 6 events)
  if (Array.isArray(memory.key_events) && memory.key_events.length > 0) {
    lines.push("\n## 📜 Key Story Events");
    const recentEvents = memory.key_events.slice(-MEMORY_LIMITS.keyEventsInPrompt);
    for (const ev of recentEvents) {
      if (ev.summary) {
        const conseq = ev.consequences ? ` (Impact: ${ev.consequences})` : "";
        lines.push(`- ${ev.summary}${conseq}`);
      }
    }
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

/**
 * Non-destructive smart merge between existing memory (including manual edits)
 * and newly generated memory updates from LLM.
 * Ported directly from memory_system/updater.py UpdateStrategy.smart_merge.
 */
export function smartMergeSessionMemory(existing, updated, lastMsgId) {
  const base = existing || createDefaultSessionMemory();
  if (!updated) return base;

  // 1. Setting: preserve existing if updated is empty
  const updatedSetting = updated.setting || {};
  const existingSetting = base.setting || {};
  const mergedSetting = {
    location: updatedSetting.location || existingSetting.location || "",
    time: updatedSetting.time || existingSetting.time || "",
    atmosphere: updatedSetting.atmosphere || existingSetting.atmosphere || "",
    world_rules: capList(
      Array.from(
        new Set([
          ...(Array.isArray(existingSetting.world_rules) ? existingSetting.world_rules : []),
          ...(Array.isArray(updatedSetting.world_rules) ? updatedSetting.world_rules : [])
        ])
      ).filter(Boolean),
      MEMORY_LIMITS.listItems
    )
  };

  // 2. Characters: keep characters from existing even if LLM missed them
  const mergedCharacters = {};
  const allCharNames = new Set([
    ...Object.keys(base.characters || {}),
    ...Object.keys(updated.characters || {})
  ]);

  for (const name of allCharNames) {
    const oldChar = (base.characters || {})[name];
    const newChar = (updated.characters || {})[name];

    if (oldChar && !newChar) {
      mergedCharacters[name] = oldChar;
    } else if (newChar && !oldChar) {
      mergedCharacters[name] = newChar;
    } else {
      // Both exist: smart merge fields
      const rel = {
        ...(typeof oldChar.relationships === "object" ? oldChar.relationships : {}),
        ...(typeof newChar.relationships === "object" ? newChar.relationships : {})
      };
      const goals = Array.from(
        new Set([
          ...(Array.isArray(oldChar.goals) ? oldChar.goals : []),
          ...(Array.isArray(newChar.goals) ? newChar.goals : [])
        ])
      ).filter(Boolean);

      const traits = Array.from(
        new Set([
          ...(Array.isArray(oldChar.important_traits) ? oldChar.important_traits : []),
          ...(Array.isArray(newChar.important_traits) ? newChar.important_traits : [])
        ])
      ).filter(Boolean);

      mergedCharacters[name] = {
        physical_state: newChar.physical_state || oldChar.physical_state || "",
        emotional_state: newChar.emotional_state || oldChar.emotional_state || "",
        relationships: rel,
        goals: goals,
        important_traits: traits,
        notes: newChar.notes || oldChar.notes || ""
      };
    }
  }

  // 3. Key Events: accumulate non-duplicate summaries, keep the most recent ones
  const existingSummaries = new Set(
    (base.key_events || []).map((e) => (e.summary || "").trim().toLowerCase())
  );
  const mergedEvents = [...(base.key_events || [])];
  for (const ev of updated.key_events || []) {
    const normSummary = (ev.summary || "").trim().toLowerCase();
    if (normSummary && !existingSummaries.has(normSummary)) {
      mergedEvents.push(ev);
      existingSummaries.add(normSummary);
    }
  }

  // 4. Unresolved Threads: deduplicate, drop threads the model marked as resolved
  const normThread = (t) => String(t || "").trim().toLowerCase();
  const resolvedSet = new Set(
    (Array.isArray(updated.resolved_threads) ? updated.resolved_threads : []).map(normThread).filter(Boolean)
  );
  const mergedThreads = capList(
    Array.from(
      new Set([
        ...(Array.isArray(base.unresolved_threads) ? base.unresolved_threads : []),
        ...(Array.isArray(updated.unresolved_threads) ? updated.unresolved_threads : [])
      ])
    )
      .filter((t) => t && String(t).trim())
      .filter((t) => !resolvedSet.has(normThread(t))),
    MEMORY_LIMITS.unresolvedThreads
  );

  // 5. Intimate Notes: non-destructive merge with caps on growing lists
  const oldIm = base.intimate_notes || {};
  const newIm = updated.intimate_notes || {};
  const mergedIm = {
    dynamics: newIm.dynamics || oldIm.dynamics || "",
    boundaries: capList(
      Array.from(
        new Set([
          ...(Array.isArray(oldIm.boundaries) ? oldIm.boundaries : []),
          ...(Array.isArray(newIm.boundaries) ? newIm.boundaries : [])
        ])
      ).filter(Boolean),
      MEMORY_LIMITS.listItems
    ),
    preferences: capList(
      Array.from(
        new Set([
          ...(Array.isArray(oldIm.preferences) ? oldIm.preferences : []),
          ...(Array.isArray(newIm.preferences) ? newIm.preferences : [])
        ])
      ).filter(Boolean),
      MEMORY_LIMITS.listItems
    ),
    recent_events: capList(
      Array.from(
        new Set([
          ...(Array.isArray(oldIm.recent_events) ? oldIm.recent_events : []),
          ...(Array.isArray(newIm.recent_events) ? newIm.recent_events : [])
        ])
      ).filter(Boolean),
      MEMORY_LIMITS.recentEvents
    )
  };

  return {
    setting: mergedSetting,
    characters: mergedCharacters,
    key_events: capList(mergedEvents, MEMORY_LIMITS.keyEventsStored),
    unresolved_threads: mergedThreads,
    intimate_notes: mergedIm,
    current_status: updated.current_status || base.current_status || "",
    last_updated_message_id:
      lastMsgId !== undefined
        ? lastMsgId
        : updated.last_updated_message_id !== undefined
        ? updated.last_updated_message_id
        : base.last_updated_message_id
  };
}

/**
 * System prompt for LLM structured memory extraction.
 * Ported and enhanced from memory_system/prompts.py with bilingual support.
 */
export const STRUCTURED_MEMORY_SYSTEM_PROMPT = `You are an expert AI Story Archivist and Memory Engine specializing in roleplay session continuity (including emotional, intimate, and romantic dynamics).

YOUR GOAL:
Analyze the EXISTING STRUCTURED MEMORY (JSON) and the NEW DIALOGUE MESSAGES, then produce an UPDATED STRUCTURED MEMORY in valid JSON format matching the schema.

CRITICAL RULES:
1. CONTINUITY: Preserve all active plot threads, promises, character traits, boundaries, and established facts.
2. DO NOT WIPE INFORMATION: Never delete character relationships, intimate preferences, or unresolved plot threads unless they have been explicitly resolved in the story.
3. EMOTIONAL & INTIMATE TRACKING:
   - Track emotional states, intimacy level, boundaries, power balance, and recent highlights.
4. KEY EVENTS: Add new major plot turning points to \`key_events\`.
5. UNRESOLVED THREADS: Record open questions, promises made, secrets shared, or pending conflicts.
   - If a thread from EXISTING MEMORY was resolved by the new messages, list its exact text in "resolved_threads". Only then it will be removed.
   - Keep "unresolved_threads" to the open threads only, at most 12 items.
6. FORMAT: Output ONLY valid JSON matching the exact schema without any markdown formatting or commentary.

JSON SCHEMA:
{
  "setting": {
    "location": "string",
    "time": "string",
    "atmosphere": "string",
    "world_rules": ["string"]
  },
  "characters": {
    "Character Name": {
      "physical_state": "string",
      "emotional_state": "string",
      "relationships": { "Target Character": "Relationship status/feeling" },
      "goals": ["string"],
      "important_traits": ["string"],
      "notes": "string"
    }
  },
  "key_events": [
    {
      "summary": "string",
      "consequences": "string",
      "timestamp": "string"
    }
  ],
  "unresolved_threads": ["string"],
  "resolved_threads": ["exact text of a thread from EXISTING MEMORY that is now resolved"],
  "intimate_notes": {
    "dynamics": "string",
    "boundaries": ["string"],
    "preferences": ["string"],
    "recent_events": ["string"]
  },
  "current_status": "string",
  "last_updated_message_id": 0
}`;

/**
 * Helper to strip thought tags or markdown codeblocks from LLM JSON response.
 */
export function cleanJsonOutput(raw) {
  if (!raw) return "{}";
  let text = raw.trim();

  // Strip <thought>...</thought> tags if model outputted reasoning
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();

  // Strip markdown code fences ```json ... ```
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "");
    text = text.replace(/\s*```$/, "");
  }

  // Find the outermost { and }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  return text;
}

/**
 * Calls LLM to extract or update structured session memory based on dialogue history.
 */
export const CODEX_AUTO_UPDATE_EVERY = 10;
export const CODEX_AUTO_UPDATE_MAX_MESSAGES = 40;
export const CODEX_CLEANUP_EVERY_UPDATES = 5;
export const CODEX_CLEANUP_WINDOW = 100;
export const SESSION_MEMORY_SNAPSHOT_LIMIT = 10;

export function getCodexProcessedCount(memory) {
  const processed = Number(memory?.last_updated_message_id);
  return Number.isFinite(processed) && processed > 0 ? processed : 0;
}

/**
 * Appends a {msgCount, memory} snapshot for a chat, capping the stored history.
 * Mirrors chatSummarySnapshots so a regenerate/delete can roll memory back
 * to the last state that still matches the canon chat.
 */
export function recordSessionMemorySnapshot(snapshotsMap, chatId, msgCount, memory) {
  if (!chatId || !memory) return snapshotsMap;
  const list = (snapshotsMap[chatId] || []).filter(s => s && typeof s.msgCount === "number" && s.msgCount !== msgCount);
  list.push({ msgCount, memory });
  snapshotsMap[chatId] = list.slice(-SESSION_MEMORY_SNAPSHOT_LIMIT);
  return snapshotsMap;
}

/**
 * Picks the newest snapshot recorded at or before targetCount and returns it
 * together with the pruned snapshot list. Returns null memory when nothing
 * fits (caller then resets to a fresh empty memory — polluted beats absent).
 */
export function selectSessionMemoryRollback(snapshotsMap, chatId, targetCount) {
  const list = (snapshotsMap[chatId] || []).filter(s => s && typeof s.msgCount === "number" && s.msgCount <= targetCount);
  if (list.length === 0) {
    return { memory: null, snapshots: [] };
  }
  const best = list[list.length - 1];
  return { memory: best.memory, snapshots: list };
}

/**
 * Extracts memory updates from a slice of the chat.
 * `options.startIndex` is the absolute index of messages[0] in the full chat,
 * so the transcript numbering and last_updated_message_id stay consistent
 * when only the new tail of the chat is processed.
 */
export async function extractStructuredMemoryFromLLM(existingMemory, messages, options = {}) {
  const apiConfig = getEffectiveApiConfig(
    state.apiSettings,
    dom.apiKeyInput ? dom.apiKeyInput.value : ""
  );

  if (!apiConfig.apiKey && !apiConfig.baseUrl) {
    throw new Error("Не указан API-ключ или локальный URL в настройках!");
  }

  const memory = existingMemory || createDefaultSessionMemory();
  const startIndex = Number.isInteger(options.startIndex) ? options.startIndex : 0;
  const lastMsgId = startIndex + messages.length;

  const activePersona = getActivePersona();
  const userName = activePersona?.userName || "User";

  // Build dialogue transcript
  const transcriptLines = messages
    .map((m, idx) => {
      let roleName = userName;
      if (m.role === "user") {
        roleName = userName;
      } else if (m.characterId) {
        const char = (state.characters || []).find((c) => c.id === m.characterId);
        roleName = char ? char.name : "Character";
      } else {
        roleName = "Assistant";
      }
      const cleanContent = (m.content || "").replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
      if (!cleanContent) return null;
      return `[#${startIndex + idx + 1}] ${roleName}: ${cleanContent}`;
    })
    .filter(Boolean);

  const currentMemoryJson = JSON.stringify(memory, null, 2);
  const cleanupBlock = options.cleanup
    ? `
=== CLEANUP PASS (PERIODIC) ===
This is a periodic full cleanup over a wider dialogue window. You MUST:
1. Rewrite setting.location, setting.time, setting.atmosphere, current_status and every character's physical_state/emotional_state to match the LATEST visible dialogue state — even if the new messages do not mention them.
2. If the visible dialogue contradicts a fact in EXISTING MEMORY, trust the dialogue and fix or remove that fact.
3. List in "resolved_threads" any threads that are stale, forgotten, or no longer relevant to the current scene.
`
    : "";
  const userPrompt = `=== EXISTING MEMORY (JSON) ===
${currentMemoryJson}

=== NEW DIALOGUE MESSAGES (Up to Message ID: ${lastMsgId}) ===
${transcriptLines.join("\n")}
${cleanupBlock}
=== INSTRUCTIONS ===
Update the Memory JSON based on the dialogue messages above.
Preserve all established facts, character relationships, and unresolved threads. List threads closed by the new messages in "resolved_threads".
Return ONLY the raw updated JSON object. Ensure "last_updated_message_id" is set to ${lastMsgId}.`;

  const primaryModel = state.apiSettings?.evaluatorModel || state.apiSettings?.selectedModel || apiConfig.model;

  const apiMessages = [
    { role: "system", content: STRUCTURED_MEMORY_SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ];

  const callModel = async (model) => sendMessageNonStream({
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model,
    apiProvider: apiConfig.apiProvider,
    messages: apiMessages,
    temperature: 0.3,
    maxTokens: 4096,
    timeoutMs: 60000
  });

  const tryParse = (raw) => {
    const cleaned = cleanJsonOutput(raw);
    return JSON.parse(cleaned);
  };

  let responseText;
  let usedModel = primaryModel;
  try {
    responseText = await callModel(primaryModel);
  } catch (err) {
    if (primaryModel !== apiConfig.model && apiConfig.model) {
      console.warn(`[SessionMemory] Primary model "${primaryModel}" failed, falling back to chat model "${apiConfig.model}":`, err);
      usedModel = apiConfig.model;
      responseText = await callModel(apiConfig.model);
    } else {
      throw err;
    }
  }

  let parsed;
  try {
    parsed = tryParse(responseText);
  } catch (firstErr) {
    // One retry: models occasionally truncate or wrap the JSON; a fresh
    // generation usually lands valid output. Cheaper than losing the update.
    console.warn("[SessionMemory] JSON parse failed, retrying extraction once:", firstErr.message);
    try {
      const retryText = await callModel(usedModel);
      parsed = tryParse(retryText);
    } catch (secondErr) {
      console.error("[SessionMemory] Failed to parse LLM JSON response after retry:", secondErr);
      throw new Error(`Ошибка парсинга JSON памяти: ${secondErr.message}`);
    }
  }

  // Perform non-destructive smart merge
  return smartMergeSessionMemory(memory, parsed, lastMsgId);
}
