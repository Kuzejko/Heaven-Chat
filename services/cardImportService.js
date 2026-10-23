import { state } from "../js/state.js";
import { dom } from "../js/ui.js";
import { getEffectiveApiConfig } from "./apiHelper.js";
import { sendMessageNonStream } from "./openrouter.js";
import { extractAndParseProfileJson } from "../js/wizards.js";

/**
 * Decodes a Base64 string to a UTF-8 string safely handling multi-byte unicode characters.
 */
export function decodeBase64ToUtf8(base64Str) {
  if (!base64Str || typeof base64Str !== "string") return "";
  const clean = base64Str.trim().replace(/[\r\n\s]/g, "");
  try {
    const binaryStr = atob(clean);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) {
    console.warn("[CardImport] Base64 decoding standard failed, trying percent-escape decode:", e);
    try {
      return decodeURIComponent(escape(atob(clean)));
    } catch (e2) {
      console.error("[CardImport] All Base64 decodings failed:", e2);
      throw new Error("Не удалось декодировать данные карточки из Base64.");
    }
  }
}

/**
 * Decompresses deflate/zlib data using browser-native DecompressionStream if available.
 */
export async function decompressDeflate(uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    console.warn("[CardImport] DecompressionStream is not supported in this environment.");
    return null;
  }

  try {
    const stream = new Blob([uint8Array]).stream().pipeThrough(new DecompressionStream("deflate"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch (_e1) {
    try {
      const streamRaw = new Blob([uint8Array]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const bufferRaw = await new Response(streamRaw).arrayBuffer();
      return new Uint8Array(bufferRaw);
    } catch (e2) {
      console.warn("[CardImport] Native decompression failed:", e2);
      return null;
    }
  }
}

/**
 * Extracts character card metadata from a PNG ArrayBuffer.
 * Chub & SillyTavern character cards store metadata in tEXt, zTXt, or iTXt chunks under keyword 'chara' or 'ccv3'.
 */
export async function extractCardDataFromPng(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Validate PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== pngSig[i]) {
      throw new Error("Файл не является корректным PNG изображением.");
    }
  }

  let offset = 8;
  const latin1Decoder = new TextDecoder("latin1");
  const utf8Decoder = new TextDecoder("utf-8");

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) break;

    const length = view.getUint32(offset);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd > bytes.length) break;

    const chunkData = bytes.subarray(dataStart, dataEnd);

    // 1. Check tEXt chunk
    if (chunkType === "tEXt") {
      let nullIndex = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i;
          break;
        }
      }

      if (nullIndex !== -1) {
        const keyword = latin1Decoder.decode(chunkData.subarray(0, nullIndex)).toLowerCase();
        if (keyword === "chara" || keyword === "ccv3" || keyword === "tavern") {
          const rawText = latin1Decoder.decode(chunkData.subarray(nullIndex + 1));
          const trimmed = rawText.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              return JSON.parse(trimmed);
            } catch (_e) {}
          }
          const decodedJson = decodeBase64ToUtf8(trimmed);
          return JSON.parse(decodedJson);
        }
      }
    }

    // 2. Check zTXt chunk (compressed)
    if (chunkType === "zTXt") {
      let nullIndex = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i;
          break;
        }
      }

      if (nullIndex !== -1) {
        const keyword = latin1Decoder.decode(chunkData.subarray(0, nullIndex)).toLowerCase();
        if (keyword === "chara" || keyword === "ccv3" || keyword === "tavern") {
          // chunkData[nullIndex + 1] is compression method (0 = deflate)
          const compressedData = chunkData.subarray(nullIndex + 2);
          const decompressed = await decompressDeflate(compressedData);
          if (decompressed) {
            const rawText = utf8Decoder.decode(decompressed).trim();
            if (rawText.startsWith("{") && rawText.endsWith("}")) {
              try {
                return JSON.parse(rawText);
              } catch (_e) {}
            }
            const decodedJson = decodeBase64ToUtf8(rawText);
            return JSON.parse(decodedJson);
          }
        }
      }
    }

    // 3. Check iTXt chunk (UTF-8 international text chunk)
    if (chunkType === "iTXt") {
      let null1 = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          null1 = i;
          break;
        }
      }

      if (null1 !== -1) {
        const keyword = latin1Decoder.decode(chunkData.subarray(0, null1)).toLowerCase();
        if (keyword === "chara" || keyword === "ccv3" || keyword === "tavern") {
          const compFlag = chunkData[null1 + 1]; // 0 = uncompressed, 1 = compressed
          let null2 = -1;
          for (let i = null1 + 3; i < chunkData.length; i++) {
            if (chunkData[i] === 0) {
              null2 = i;
              break;
            }
          }
          if (null2 !== -1) {
            let null3 = -1;
            for (let i = null2 + 1; i < chunkData.length; i++) {
              if (chunkData[i] === 0) {
                null3 = i;
                break;
              }
            }
            if (null3 !== -1) {
              const textBytes = chunkData.subarray(null3 + 1);
              let textStr = "";
              if (compFlag === 1) {
                const decompressed = await decompressDeflate(textBytes);
                if (decompressed) {
                  textStr = utf8Decoder.decode(decompressed);
                }
              } else {
                textStr = utf8Decoder.decode(textBytes);
              }

              if (textStr) {
                const trimmed = textStr.trim();
                if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                  try {
                    return JSON.parse(trimmed);
                  } catch (_e) {}
                }
                const decodedJson = decodeBase64ToUtf8(trimmed);
                return JSON.parse(decodedJson);
              }
            }
          }
        }
      }
    }

    // Advance to next chunk (length + 4 byte chunkType + length + 4 byte CRC)
    offset += 8 + length + 4;
  }

  throw new Error("В данном PNG-изображении не найдены метаданные карточки персонажа (chara/ccv3).");
}

/**
 * Normalizes any Chub/Tavern/SillyTavern card JSON (V1, V2, V3, Chub Definition)
 * into a standardized RawCard object.
 */
export function normalizeCharacterCardJson(jsonObj, avatarUrl = "") {
  if (!jsonObj || typeof jsonObj !== "object") {
    throw new Error("Некорректный формат данных карточки.");
  }

  let data = jsonObj;
  let formatVersion = "v1";

  // Check Character Card V2 or V3 specification
  if (jsonObj.spec === "chara_card_v2" || jsonObj.spec_version === "2.0" || (jsonObj.data && typeof jsonObj.data === "object")) {
    data = jsonObj.data || jsonObj;
    formatVersion = "v2";
  } else if (jsonObj.spec === "chara_card_v3" || jsonObj.spec_version === "3.0") {
    data = jsonObj.data || jsonObj;
    formatVersion = "v3";
  } else if (jsonObj.definition && typeof jsonObj.definition === "object") {
    data = jsonObj.definition;
    formatVersion = "chub_definition";
  }

  // Extract Lorebook / Character Book entries
  const lorebookEntries = [];
  const charBook = data.character_book || jsonObj.character_book || data.lorebook || jsonObj.lorebook;
  if (charBook && Array.isArray(charBook.entries)) {
    charBook.entries.forEach(entry => {
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

      const contentStr = entry.content || entry.entry || "";
      if (keysStr || contentStr) {
        lorebookEntries.push({
          name: entry.name || entry.comment || "",
          keys: keysStr,
          content: contentStr,
          enabled: entry.enabled !== false
        });
      }
    });
  }

  // Extract Alternate Greetings
  const altGreetings = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.filter(g => typeof g === "string" && g.trim())
    : [];

  // Extract Tags
  let tags = [];
  if (Array.isArray(data.tags)) {
    tags = data.tags.map(t => String(t).trim()).filter(Boolean);
  } else if (typeof data.tags === "string") {
    tags = data.tags.split(",").map(t => t.trim()).filter(Boolean);
  }

  const rawCard = {
    name: data.name || jsonObj.name || "Персонаж",
    description: data.description || jsonObj.description || "",
    personality: data.personality || jsonObj.personality || "",
    scenario: data.scenario || jsonObj.scenario || "",
    firstMessage: data.first_mes || data.firstMessage || jsonObj.first_mes || jsonObj.firstMessage || "",
    exampleDialogs: data.mes_example || data.exampleDialogs || jsonObj.mes_example || jsonObj.exampleDialogs || "",
    systemPrompt: data.system_prompt || data.systemPrompt || jsonObj.system_prompt || jsonObj.systemPrompt || "",
    postHistoryInstructions: data.post_history_instructions || jsonObj.post_history_instructions || "",
    creatorNotes: data.creator_notes || jsonObj.creator_notes || "",
    alternateGreetings: altGreetings,
    tags: tags,
    lorebook: lorebookEntries,
    avatarUrl: avatarUrl || data.avatarUrl || jsonObj.avatarUrl || "",
    formatVersion: formatVersion,
    rawSource: jsonObj
  };

  return rawCard;
}

/**
 * Loads and parses a character card file (PNG or JSON).
 */
export async function parseCharacterCardFile(file) {
  if (!file) throw new Error("Файл не выбран.");

  const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  const isJson = file.type === "application/json" || file.name.toLowerCase().endsWith(".json") || file.name.toLowerCase().endsWith(".chub") || file.name.toLowerCase().endsWith(".card");

  if (!isPng && !isJson) {
    // Try to detect by reading array buffer signature
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      // It is PNG
      const rawJson = await extractCardDataFromPng(buffer);
      const avatarUrl = await readBlobAsDataUrl(file);
      return normalizeCharacterCardJson(rawJson, avatarUrl);
    } else {
      // Try text JSON
      const text = new TextDecoder("utf-8").decode(bytes);
      const rawJson = JSON.parse(text);
      return normalizeCharacterCardJson(rawJson, "");
    }
  }

  if (isPng) {
    const buffer = await file.arrayBuffer();
    const rawJson = await extractCardDataFromPng(buffer);
    const avatarUrl = await readBlobAsDataUrl(file);
    return normalizeCharacterCardJson(rawJson, avatarUrl);
  } else {
    const text = await file.text();
    const rawJson = JSON.parse(text);
    return normalizeCharacterCardJson(rawJson, "");
  }
}

/**
 * Helper to read a Blob/File as Base64 Data URL for avatars.
 */
function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

/**
 * AI Model Adaptation & Localization of a Character Card to Russian.
 * Translates and structures character fields, dialogue patterns, macros, and lorebook entries.
 */
export async function adaptCharacterCardToRussian(rawCard, customModel, onProgress) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    throw new Error("Для адаптации карточки через ИИ требуется API ключ. Укажите его в Настройках.");
  }

  const modelToUse = customModel || dom.wizardModelSelect?.value || apiConfig.model || "openai/gpt-4o-mini";

  if (typeof onProgress === "function") {
    onProgress("Анализируем структуру карточки персонажа...");
  }

  const systemInstruction = `You are a World-Class Character Localization Specialist and Master Russian Roleplay Prompt Engineer.
Your task is to translate and masterfully adapt an English roleplay character card into rich, natural, highly engaging Russian.

CRITICAL ROLEPLAY REQUIREMENTS FOR RUSSIAN ADAPTATION:
1. "name": The character's authentic name in Russian (transliterate or adapt naturally, e.g. "Shadowheart" -> "Шэдоухарт", "Elizabeth" -> "Элизабет", "Arthur" -> "Артур").
2. "gender": "she/her" | "he/him" | "they/them".
3. "description": A concise, captivating one-line bio/summary in Russian.
4. "traits": Array of 3 to 6 evocative trait tags in Russian and English (e.g. ["Cold", "Tsundere", "Холодная", "Умная"]).
5. "appearance": Detailed physical description in Russian (face, eyes, hair, clothing, physique, distinctive features).
6. "behavior": Deep psychological profile, habits, fears, motivations, attitude towards {{user}} in Russian.
7. "backstory": Character's past, lore, secrets, biography in Russian.
8. "speech": Character's speech style, quirks, tone of voice, cadence in Russian (e.g. uses polite 'вы', old-fashioned phrases, sarcastic tone, nicknames).
9. "scenario": Atmospheric starting setting and situation where {{char}} and {{user}} meet, written in rich 3rd-person Russian narration.
10. "firstMessage": The opening dialogue greeting by {{char}}.
    - Use asterisks *...* for actions, expressions, and atmosphere.
    - Use double quotes "..." for spoken words.
    - PRESERVE macros like {{user}} and {{char}} untouched.
    - Ensure grammatically correct Russian gender agreements (past tense verbs, adjectives).
11. "greetingVariants": Array of 2-3 distinct greeting options in Russian (including adapted alternate greetings if provided in the original card).
12. "exampleDialogs": Dialogue examples translated to natural Russian. PRESERVE <START>, {{char}}:, and {{user}}: format.
13. "systemPrompt": System prompt and roleplay instructions translated and adapted to Russian roleplay guidelines.
14. "lorebook": Array of lore entries translated to Russian with relevant trigger keywords in Russian and English:
    [
      { "keys": "ключевое_слово, синоним, keyword", "content": "Подробное описание лора на русском языке", "enabled": true }
    ]
15. "imagePrompt": A polished English text prompt for Midjourney / Stable Diffusion / Flux avatar generation.

IMPORTANT:
- Keep all formatting macros {{user}}, {{char}}, <START> intact.
- Translate any embedded W++ / Boosted personality attributes into descriptive, coherent Russian sentences in appearance, behavior, backstory, and speech fields.
- Respond ONLY with a valid JSON object wrapped inside \`\`\`json ... \`\`\` code block.`;

  // Prepare input summary for AI
  let lorebookText = "";
  if (rawCard.lorebook && rawCard.lorebook.length > 0) {
    lorebookText = rawCard.lorebook.map((entry, idx) => {
      return `[Entry ${idx + 1}]: Keys: "${entry.keys}"\nContent: "${entry.content}"`;
    }).join("\n\n");
  }

  let altGreetingsText = "";
  if (rawCard.alternateGreetings && rawCard.alternateGreetings.length > 0) {
    altGreetingsText = rawCard.alternateGreetings.map((g, idx) => `[Alt ${idx + 1}]: ${g}`).join("\n\n");
  }

  const userPrompt = `Пожалуйста, адаптируй и переведи эту карточку персонажа на русский язык:

ИМЯ (Original Name): ${rawCard.name}
КРАТКОЕ ОПИСАНИЕ (Description): ${rawCard.description}
ЛИЧНОСТЬ И ХАРАКТЕР (Personality / Attributes):
${rawCard.personality}

СЦЕНАРИЙ (Scenario):
${rawCard.scenario}

ПЕРВОЕ СООБЩЕНИЕ (First Message / Greeting):
${rawCard.firstMessage}

${altGreetingsText ? `АЛЬТЕРНАТИВНЫЕ ПРИВЕТСТВИЯ (Alternate Greetings):\n${altGreetingsText}\n` : ""}
${rawCard.exampleDialogs ? `ПРИМЕРЫ ДИАЛОГА (Example Dialogs):\n${rawCard.exampleDialogs}\n` : ""}
${rawCard.systemPrompt ? `СИСТЕМНЫЙ ПРОМПТ (System Prompt):\n${rawCard.systemPrompt}\n` : ""}
${lorebookText ? `ВСТРОЕННЫЙ ЛОРБУК (Lorebook Entries):\n${lorebookText}\n` : ""}
${rawCard.tags && rawCard.tags.length > 0 ? `ТЕГИ (Tags): ${rawCard.tags.join(", ")}\n` : ""}`;

  const messages = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt }
  ];

  if (typeof onProgress === "function") {
    onProgress("ИИ переводит и адаптирует личность, сценарий, реплики и лорбук...");
  }

  const response = await sendMessageNonStream({
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model: modelToUse,
    messages: messages,
    temperature: 0.7,
    maxTokens: 4000
  });

  if (typeof onProgress === "function") {
    onProgress("Обработка результата...");
  }

  const parsed = extractAndParseProfileJson(response);
  if (!parsed || (!parsed.name && !parsed.behavior && !parsed.description)) {
    throw new Error("Не удалось разобрать адаптированный профиль персонажа от ИИ. Попробуйте повторить запрос.");
  }

  // Preserve avatar from raw card if available
  parsed.avatarUrl = rawCard.avatarUrl || parsed.avatarUrl || "";

  // Merge lorebook if provided in parsed response
  if (Array.isArray(parsed.lorebook)) {
    parsed.lorebook = parsed.lorebook.map(entry => ({
      keys: typeof entry.keys === "string" ? entry.keys : (Array.isArray(entry.keys) ? entry.keys.join(", ") : ""),
      content: entry.content || "",
      enabled: entry.enabled !== false
    })).filter(e => e.keys && e.content);
  } else if (rawCard.lorebook && rawCard.lorebook.length > 0) {
    parsed.lorebook = rawCard.lorebook;
  }

  return parsed;
}
