import { sendMessageNonStream } from "./openrouter.js";
import { getEffectiveApiConfig } from "./apiHelper.js";
import { state } from "../js/state.js";
import { dom } from "../js/ui.js";
import { getActivePersona } from "./storage.js";

export const MEMORY_LIMITS = {
  listItems: 15,
  recentEvents: 8,
  keyEventsStored: 30,
  keyEventsInPrompt: 6,
  unresolvedThreads: 12,
  characterGoals: 5,
  characterTraits: 8,
  permanentAnchors: 10
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
    permanent_anchors: [],
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
 * @param {Object} memory
 * @param {Object} [options]
 * @param {string} [options.activeCharacterName] Name of the responding character
 * @param {boolean} [options.isDuo] Whether duo character mode is active
 */
export function formatMemoryToMarkdown(memory, options = {}) {
  if (!memory) return "";
  const { activeCharacterName, isDuo } = options;

  const lines = ["# 🧠 STRUCTURED MEMORY CONTEXT"];

  // 1. Setting & Atmosphere (compact single-header format)
  const s = memory.setting || {};
  const settingParts = [];
  if (s.location) settingParts.push(`**Location**: ${s.location}`);
  if (s.time) settingParts.push(`**Time**: ${s.time}`);
  if (s.atmosphere) settingParts.push(`**Atmosphere**: ${s.atmosphere}`);
  if (Array.isArray(s.world_rules) && s.world_rules.length > 0) {
    settingParts.push(`**World Rules**: ${s.world_rules.join(", ")}`);
  }
  if (settingParts.length > 0) {
    lines.push(`\n## 📍 Setting: ${settingParts.join(" | ")}`);
  }

  // 2. Current Situation
  if (memory.current_status && memory.current_status.trim()) {
    lines.push(`\n## ⚡ Current Situation: ${memory.current_status.trim()}`);
  }

  // 3. Permanent Anchors & Key Facts
  if (Array.isArray(memory.permanent_anchors) && memory.permanent_anchors.length > 0) {
    const validAnchors = memory.permanent_anchors.filter(a => a && String(a).trim());
    if (validAnchors.length > 0) {
      lines.push(`\n## ⚓ Permanent Anchors\n${validAnchors.map(a => `- ${String(a).trim()}`).join("\n")}`);
    }
  }

  // 4. Characters & Relationships (compact bullet lines per character)
  const chars = memory.characters || {};
  const charKeys = Object.keys(chars);
  if (charKeys.length > 0) {
    lines.push("\n## 👥 Character States & Relationships");
    for (const name of charKeys) {
      const c = chars[name] || {};
      const charDetails = [];
      if (c.physical_state) charDetails.push(`**Physical**: ${c.physical_state}`);
      if (c.emotional_state) charDetails.push(`**Emotional**: ${c.emotional_state}`);
      if (c.relationships && typeof c.relationships === "object" && Object.keys(c.relationships).length > 0) {
        const relStr = Object.entries(c.relationships)
          .map(([target, rel]) => `${target}: ${rel}`)
          .join("; ");
        charDetails.push(`**Relationships**: ${relStr}`);
      }
      if (Array.isArray(c.goals) && c.goals.length > 0) {
        charDetails.push(`**Goals**: ${c.goals.join(", ")}`);
      }
      if (Array.isArray(c.important_traits) && c.important_traits.length > 0) {
        charDetails.push(`**Traits**: ${c.important_traits.join(", ")}`);
      }
      const isOtherCharInDuo = Boolean(
        isDuo &&
        activeCharacterName &&
        name.trim().toLowerCase() !== activeCharacterName.trim().toLowerCase()
      );
      if (c.notes && !isOtherCharInDuo) {
        charDetails.push(`**Notes**: ${c.notes}`);
      }

      if (charDetails.length > 0) {
        lines.push(`### ${name}\n${charDetails.map(d => `- ${d}`).join("\n")}`);
      } else {
        lines.push(`### ${name}`);
      }
    }
  }

  // 5. Intimate & Relationship Dynamics
  const im = memory.intimate_notes || {};
  const imParts = [];
  if (im.dynamics) imParts.push(`**Dynamics**: ${im.dynamics}`);
  if (Array.isArray(im.boundaries) && im.boundaries.length > 0) {
    imParts.push(`**Boundaries**: ${im.boundaries.join(", ")}`);
  }
  if (Array.isArray(im.preferences) && im.preferences.length > 0) {
    imParts.push(`**Preferences**: ${im.preferences.join(", ")}`);
  }
  if (Array.isArray(im.recent_events) && im.recent_events.length > 0) {
    imParts.push(`**Recent Highlights**: ${im.recent_events.join("; ")}`);
  }
  if (imParts.length > 0) {
    lines.push(`\n## 💖 Intimate & Dynamics\n${imParts.map(p => `- ${p}`).join("\n")}`);
  }

  // 6. Unresolved Plot Threads & Promises
  if (Array.isArray(memory.unresolved_threads) && memory.unresolved_threads.length > 0) {
    const validThreads = memory.unresolved_threads.filter(t => t && t.trim());
    if (validThreads.length > 0) {
      lines.push(`\n## 📌 Unresolved Threads\n${validThreads.map(t => `- ${t.trim()}`).join("\n")}`);
    }
  }

  // 7. Key Story Events (Recent up to 6 events)
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

  // 2. Canonical user name helper for relationships normalization
  const activePersona = getActivePersona();
  const canonUserName = (activePersona?.userName || "User").trim();
  const normalizeTargetName = (target) => {
    if (!target) return canonUserName;
    const t = String(target).trim().toLowerCase();
    if (t === "user" || t === "игрок" || t === "player" || t === canonUserName.toLowerCase()) {
      return canonUserName;
    }
    return String(target).trim();
  };

  // 3. Characters: deduplicate case-insensitively and normalize relationships/goals/traits
  const oldChars = base.characters || {};
  const newChars = updated.characters || {};
  const charKeyMap = new Map();

  for (const [k, v] of Object.entries(oldChars)) {
    const norm = k.trim().toLowerCase();
    if (!norm) continue;
    charKeyMap.set(norm, { displayName: k.trim(), oldChar: v, newChar: null });
  }

  for (const [k, v] of Object.entries(newChars)) {
    const norm = k.trim().toLowerCase();
    if (!norm) continue;
    const entry = charKeyMap.get(norm);
    if (entry) {
      entry.newChar = v;
      if (k.trim() !== norm || !entry.displayName) {
        entry.displayName = k.trim();
      }
    } else {
      charKeyMap.set(norm, { displayName: k.trim(), oldChar: null, newChar: v });
    }
  }

  const mergedCharacters = {};
  for (const [_, entry] of charKeyMap.entries()) {
    const name = entry.displayName;
    const oldChar = entry.oldChar;
    const newChar = entry.newChar;

    if (oldChar && !newChar) {
      const rel = {};
      if (oldChar.relationships && typeof oldChar.relationships === "object") {
        for (const [t, r] of Object.entries(oldChar.relationships)) {
          rel[normalizeTargetName(t)] = r;
        }
      }
      mergedCharacters[name] = {
        ...oldChar,
        relationships: rel,
        goals: capList(Array.isArray(oldChar.goals) ? oldChar.goals : [], MEMORY_LIMITS.characterGoals),
        important_traits: capList(Array.isArray(oldChar.important_traits) ? oldChar.important_traits : [], MEMORY_LIMITS.characterTraits)
      };
    } else if (newChar && !oldChar) {
      const rel = {};
      if (newChar.relationships && typeof newChar.relationships === "object") {
        for (const [t, r] of Object.entries(newChar.relationships)) {
          rel[normalizeTargetName(t)] = r;
        }
      }
      mergedCharacters[name] = {
        ...newChar,
        relationships: rel,
        goals: capList(Array.isArray(newChar.goals) ? newChar.goals : [], MEMORY_LIMITS.characterGoals),
        important_traits: capList(Array.isArray(newChar.important_traits) ? newChar.important_traits : [], MEMORY_LIMITS.characterTraits)
      };
    } else {
      const rel = {};
      const mergeRel = (sourceRel) => {
        if (!sourceRel || typeof sourceRel !== "object") return;
        for (const [t, r] of Object.entries(sourceRel)) {
          rel[normalizeTargetName(t)] = r;
        }
      };
      mergeRel(oldChar.relationships);
      mergeRel(newChar.relationships);

      // Filter out completed momentary goals
      const completedSet = new Set(
        [
          ...(Array.isArray(newChar.completed_goals) ? newChar.completed_goals : []),
          ...(Array.isArray(updated.completed_goals) ? updated.completed_goals : [])
        ]
          .map(g => String(g || "").trim().toLowerCase())
          .filter(Boolean)
      );

      const oldGoals = Array.isArray(oldChar.goals) ? oldChar.goals : [];
      const newGoals = Array.isArray(newChar.goals) ? newChar.goals : [];
      const seenGoals = new Set();
      const uncompletedGoals = [];
      for (const g of [...oldGoals, ...newGoals]) {
        const normG = String(g || "").trim().toLowerCase();
        if (!normG || seenGoals.has(normG) || completedSet.has(normG)) continue;
        seenGoals.add(normG);
        uncompletedGoals.push(typeof g === "string" ? g.trim() : g);
      }
      const goals = capList(uncompletedGoals, MEMORY_LIMITS.characterGoals);

      // Important traits
      const oldTraits = Array.isArray(oldChar.important_traits) ? oldChar.important_traits : [];
      const newTraits = Array.isArray(newChar.important_traits) ? newChar.important_traits : [];
      const seenTraits = new Set();
      const mergedTraits = [];
      for (const t of [...oldTraits, ...newTraits]) {
        const normT = String(t || "").trim().toLowerCase();
        if (!normT || seenTraits.has(normT)) continue;
        seenTraits.add(normT);
        mergedTraits.push(typeof t === "string" ? t.trim() : t);
      }
      const traits = capList(mergedTraits, MEMORY_LIMITS.characterTraits);

      mergedCharacters[name] = {
        physical_state: newChar.physical_state || oldChar.physical_state || "",
        emotional_state: newChar.emotional_state || oldChar.emotional_state || "",
        relationships: rel,
        goals,
        important_traits: traits,
        notes: newChar.notes || oldChar.notes || ""
      };
    }
  }

  // 4. Permanent Anchors: non-decaying key facts (sworn oaths, nicknames, crucial items, scars)
  const existingAnchors = Array.isArray(base.permanent_anchors) ? base.permanent_anchors : [];
  const updatedAnchors = Array.isArray(updated.permanent_anchors) ? updated.permanent_anchors : [];
  const seenAnchors = new Set();
  const mergedAnchors = [];
  for (const a of [...existingAnchors, ...updatedAnchors]) {
    const str = String(a || "").trim();
    const norm = str.toLowerCase();
    if (!norm || seenAnchors.has(norm)) continue;
    seenAnchors.add(norm);
    mergedAnchors.push(str);
  }
  const finalAnchors = capList(mergedAnchors, MEMORY_LIMITS.permanentAnchors);

  // 5. Key Events: accumulate non-duplicate summaries, keep the most recent ones
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

  // 6. Unresolved Threads: deduplicate, drop threads the model marked as resolved
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

  // 7. Intimate Notes: non-destructive merge with caps on growing lists
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
    permanent_anchors: finalAnchors,
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
6. PERMANENT ANCHORS: Track up to 10 crucial non-decaying anchors (given oaths, gifted key items/inventory, nicknames, scars/marks) in "permanent_anchors".
7. COMPLETED GOALS: If an existing character goal was accomplished or is no longer pursued, list its exact text in that character's "completed_goals". Keep active goals to at most 5 items.
8. FORMAT: Output ONLY valid JSON matching the exact schema without any markdown formatting or commentary.

JSON SCHEMA:
{
  "setting": {
    "location": "string",
    "time": "string",
    "atmosphere": "string",
    "world_rules": ["string"]
  },
  "permanent_anchors": ["string (up to 10 unyielding facts: oaths, inventory, scars)"],
  "characters": {
    "Character Name": {
      "physical_state": "string",
      "emotional_state": "string",
      "relationships": { "Target Character": "Relationship status/feeling" },
      "goals": ["string (max 5 active goals)"],
      "completed_goals": ["exact text of completed goals from EXISTING MEMORY"],
      "important_traits": ["string (max 8 traits)"],
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
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastMsgId = (lastMsg && typeof lastMsg.seq === "number") ? lastMsg.seq : (startIndex + messages.length);

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
      const msgSeq = (m && typeof m.seq === "number") ? m.seq : (startIndex + idx + 1);
      return `[#${msgSeq}] ${roleName}: ${cleanContent}`;
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
