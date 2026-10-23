import { state } from "../js/state.js";
import { checkLoreBookTriggers } from "../js/stemmer.js";
import { getActiveChatId, getActivePersona } from "./storage.js";
import { dom } from "../js/ui.js";
import { getEffectiveApiConfig } from "./apiHelper.js";
import { sendMessageNonStream } from "./openrouter.js";

export function scanLoreBookAndBuildContent(character, userPrompt = "") {
  if (!character.lorebook || !Array.isArray(character.lorebook) || character.lorebook.length === 0) {
    return "";
  }
  
  const activeChatId = getActiveChatId(character.id);
  const chat = state.chats[activeChatId] || [];
  
  let historyText = userPrompt;
  const recentMsgs = chat.slice(-2);
  recentMsgs.forEach(msg => {
    historyText += " " + msg.content;
  });
  
  const activeLore = [];
  
  character.lorebook.forEach(entry => {
    if (entry.enabled === false) return;
    
    if (checkLoreBookTriggers(historyText, entry.keys)) {
      activeLore.push(entry.content.trim());
    }
  });
  
  if (activeLore.length === 0) return "";
  
  return `\n--- WORLD LORE & CONTEXT ---\n${activeLore.join("\n\n")}`;
}

export async function generateLoreTriggers(topic, detail) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    console.warn("API key is missing for trigger generation.");
    return null;
  }

  const prompt = `You are a roleplay system assistant.
We have a lore subject or concept: "${topic}"
Lore details: "${detail || "No details provided"}"

Generate a list of trigger words, synonyms, grammatical variations, and closely related terms in Russian and English that should activate this lore block when written in chat.
Rules:
1. Provide a comma-separated list of words/phrases.
2. Include spelling variations, synonyms, and related concepts.
3. Keep the list to 6-12 high-quality terms.
4. Output ONLY the comma-separated words. Do not output markdown, bullet points, explanations, or quotes.

Example topic: "Excalibur"
Example output:
Excalibur, Экскалибур, легендарный меч, sword, Артур, Авалон, клинок, ножны Экскалибура, волшебный меч`;

  try {
    const messages = [{ role: "user", content: prompt }];
    const response = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: dom.characterModelSelect?.value || apiConfig.model,
      messages,
      temperature: 0.5,
      maxTokens: 200
    });
    
    return response.trim().replace(/^```|```$/g, "").trim();
  } catch (error) {
    console.error("Failed to generate lore triggers:", error);
  }
  return null;
}

export async function improveLoreContent(topic, currentContent) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    console.warn("API key is missing for lore content improvement.");
    return null;
  }

  let prompt = "";
  if (!currentContent) {
    prompt = `You are a creative writer and roleplay world builder.
We have a concept or trigger word: "${topic}".
Write a detailed, atmospheric, and highly immersive description or background details about "${topic}" (1-2 paragraphs, max 100 words) suitable to be injected as character knowledge/world lore in a chat session.
Write it in Russian.
Output ONLY the description text, no conversational intro, no quotes, and no formatting metadata.`;
  } else {
    prompt = `You are a creative editor.
We have a lore concept: "${topic}".
Current draft description: "${currentContent}".

Rewrite and dramatically improve this lore description. Make it sound professional, atmospheric, and highly engaging for a roleplay session. Write it in Russian.
Keep it concise (max 100 words).
Output ONLY the polished description text, no conversational filler, no quotes, and no intro.`;
  }

  try {
    const messages = [{ role: "user", content: prompt }];
    const response = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: dom.characterModelSelect?.value || apiConfig.model,
      messages,
      temperature: 0.7,
      maxTokens: 300
    });
    
    return response.trim().replace(/^```|```$/g, "").trim();
  } catch (error) {
    console.error("Failed to generate/improve lore content:", error);
  }
  return null;
}

export async function generateWorldLoreFromChat(chatId) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    throw new Error("Не указан API-ключ или локальный URL в настройках!");
  }

  const chat = state.chats[chatId] || [];
  const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";
  const activeSummary = state.chatSummaries?.[chatId] || "";
  const selectedGenre = state.chatMetadata?.[chatId]?.worldGenre || state.apiSettings?.worldGenre || "fantasy";

  const genreDescriptions = {
    fantasy: "🧙‍♂️ Фэнтези / Средневековье (Королевства, Замки, Магия, Драконы, Артефакты, Беруши из воска)",
    modern: "🏙️ Современный мир (Города, Страны, Технологии, Законы, Спецслужбы)",
    scifi: "🚀 Научная фантастика (Планеты, Империи, Космос, Высокие технологии, Лазеры)",
    cyberpunk: "🌃 Киберпанк (Мегаполисы, Корпорации, Законы улиц, Импланты, Хакеры)",
    any: "🎲 Общий ролевой сеттинг"
  };

  // Prepare chat transcript text (last 30 messages max)
  const userName = getActivePersona()?.userName || "User";
  const recentMsgs = chat.slice(-30).map(m => {
    const roleName = m.role === "user" ? userName : "Character";
    const cleanText = (m.content || "").replace(/<thought[\s\S]*?<\/thought>/gi, "").trim();
    return `${roleName}: ${cleanText}`;
  }).join("\n");

  const prompt = `Ты — ведущий архивариус и мастер создания миров (World Builder & Game Master).
Твоя задача — сгенерировать ПОЛНОЦЕННЫЙ, БОГАТЫЙ ЭНЦИКЛОПЕДИЧЕСКИЙ ЛОР И УСТРОЙСТВО МИРА (World Lore Compendium) для ролевой игры в сеттинге: "${genreDescriptions[selectedGenre] || selectedGenre}".

Текущее Саммари сюжета:
"""
${activeSummary || "Сюжет развивается"}
"""

Выдержка из диалога:
"""
${recentMsgs || "Начало истории"}
"""

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ГЕНЕРАЦИИ МИРА:
1. Опирайся на упомянутые факты из чата.
2. ЕСЛИ ИНФОРМАЦИИ В ЧАТЕ МАЛО, ОБЯЗАТЕЛЬНО ПРОЯВИ ТВОРЧЕСТВО И СГЕНЕРИРУЙ БОГАТЫЙ МИР САМ! МИР НЕ ДОЛЖЕН БЫТЬ ПУСТЫМ!
3. Выдай СТРОГО:
   - "locations": минимум 3-4 отдельных страны, королевства или крупных города с подробным описанием атмосферы и столицы.
   - "rules": минимум 2-3 правила магии, законов мира или физики/природы.
   - "factions": минимум 2-3 влиятельных ордена, гильдии, клана или фракции.
   - "items": минимум 2-3 ключевых предмета, артефакта или реликвии.

Выведи результат СТРОГО в формате валидного JSON объекта без вводных фраз и без бэктиков:

{
  "locations": [
    { "name": "Название страны или города", "description": "Подробное описание: климат, атмосфера, правитель, особенности." },
    { "name": "Вторая страна / город", "description": "Описание второй страны." },
    { "name": "Третья страна / город", "description": "Описание третьей страны." }
  ],
  "rules": [
    { "name": "Название правила магии или закона мира", "description": "Как работает магия, заклинания или законы." },
    { "name": "Второе правило мира", "description": "Описание второго правила." }
  ],
  "factions": [
    { "name": "Название гильдии или ордена", "description": "Цели фракции и её влияние в мире." },
    { "name": "Вторая фракция", "description": "Описание второй фракции." }
  ],
  "items": [
    { "name": "Название артефакта или реликвии", "description": "Особенности, свойства и история предмета." },
    { "name": "Второй артефакт", "description": "Описание артефакта." }
  ]
}

Пиши на ${isRu ? "русском" : "английском"} языке.`;

  const response = await sendMessageNonStream({
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model: state.apiSettings.evaluatorModel || apiConfig.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.5,
    maxTokens: 1600
  });

  const parsed = extractAndParseJsonObject(response);
  let locations = parsed ? sanitizeItemsArray(parsed.locations) : [];
  let rules = parsed ? sanitizeItemsArray(parsed.rules) : [];
  let factions = parsed ? sanitizeItemsArray(parsed.factions) : [];
  let items = parsed ? sanitizeItemsArray(parsed.items) : [];

  // Fallbacks if AI returns empty or missing arrays so world is NEVER empty!
  if (locations.length === 0) {
    locations = selectedGenre === "fantasy" ? [
      { name: "Королевство Валория", description: "Столица — великий каменный город с уличными фонарями, шумными рынками и башнями магов." },
      { name: "Эльфийский Лес Эвергрин", description: "Древний священный лес на востоке, родина эльфиек, находящийся под защитой звукоизолирующих чар." },
      { name: "Торговый Порт-Ройал", description: "Прибрежный город-порт, пристанище гильдий купцов, алхимиков и морских путешественников." }
    ] : [
      { name: "Центральный Мегаполис", description: "Огромный футуристический город с высотными зданиями и развитой инфраструктурой." },
      { name: "Северный Техноград", description: "Индустриальный центр, где сосредоточена научно-исследовательская жизнь мира." }
    ];
  }

  if (rules.length === 0) {
    rules = selectedGenre === "fantasy" ? [
      { name: "Законы Магии Стихий", description: "Магические заклинания требуют фокусировки через кристаллы или вербальные формулы." },
      { name: "Чары Звукоизоляции & Восковые Беруши", description: "В мире принято спасаться от шума магов и дивного пения с помощью восковых берушей и тихих чар." }
    ] : [
      { name: "Энергетический Баланс", description: "Использование высокотехнологичных ресурсов строго регулируется общими законами." }
    ];
  }

  if (factions.length === 0) {
    factions = selectedGenre === "fantasy" ? [
      { name: "Орден Серебряного Клинка", description: "Элитное рыцарское братство, охраняющее покой королевства и мирных жителей." },
      { name: "Гильдия Архивариусов & Магов", description: "Сообщество ученых, хранящее древние свитки, карты мира и хроники событий." }
    ] : [
      { name: "Альянс Исследователей", description: "Объединение ученых и разведчиков, изучающих новые территории." }
    ];
  }

  if (items.length === 0) {
    items = selectedGenre === "fantasy" ? [
      { name: "Серебряный Амулет Тишины", description: "Древний кулон, поглощающий громкие звуки и сохраняющий покой владельца." },
      { name: "Кристалл Стихийного Фокуса", description: "Редкий драгоценный камень, усиливающий действие магии и заклинаний." }
    ] : [
      { name: "Информационный Модуль", description: "Портативный накопитель с зашифрованными хрониками истории." }
    ];
  }

  return { locations, rules, factions, items };
}

function stripMarkdownFences(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();
}

function extractAndParseJsonObject(responseText) {
  if (!responseText || typeof responseText !== "string") return null;
  const cleaned = stripMarkdownFences(responseText);

  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");

  if (startIdx !== -1 && endIdx > startIdx) {
    const jsonSubstring = cleaned.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(jsonSubstring);
    } catch (e1) {
      try {
        const fixedJson = jsonSubstring.replace(/,\s*([}\]])/g, "$1");
        return JSON.parse(fixedJson);
      } catch (e2) {
        console.warn("Failed to parse JSON substring directly:", e2);
      }
    }
  }
  return null;
}

function sanitizeItemsArray(rawInput) {
  if (!rawInput) return [];

  if (Array.isArray(rawInput)) {
    return rawInput.map((item, idx) => {
      if (typeof item === "string") {
        const cleanStr = stripMarkdownFences(item);
        if (!cleanStr || /^[{\}\[\]",:`\s]+$/.test(cleanStr)) return null;
        const parts = cleanStr.split(/[:—–-]/);
        if (parts.length >= 2) {
          return { name: parts[0].replace(/^[•\d\.\s\-\*"`]+/, "").replace(/["`]$/, "").trim(), description: parts.slice(1).join("—").replace(/^[•\s\-\*"`]+/, "").replace(/["`]$/, "").trim() };
        }
        return { name: `Запись #${idx + 1}`, description: cleanStr.trim() };
      }
      if (typeof item === "object" && item !== null) {
        const name = String(item.name || item.title || item.location || item.rule || item.faction || item.item || "").replace(/^["`\s]+|["`\s]+$/g, "").trim();
        const description = String(item.description || item.desc || item.details || "").replace(/^["`\s]+|["`\s]+$/g, "").trim();
        if (name || description) {
          return { name: name || `Запись #${idx + 1}`, description: description };
        }
      }
      return null;
    }).filter(Boolean);
  }

  if (typeof rawInput === "string") {
    const cleanedText = stripMarkdownFences(rawInput);
    const lines = cleanedText.split(/(?:\r?\n)+/)
      .map(l => l.trim())
      .filter(l => l && !/^[{\}\[\]",:`\s]+$/.test(l) && !/^"(locations|rules|factions|items|name|description)":/i.test(l));

    return lines.map((line, idx) => {
      const parts = line.split(/[:—–-]/);
      if (parts.length >= 2) {
        return { name: parts[0].replace(/^[•\d\.\s\-\*"`]+/, "").replace(/["`]$/, "").trim(), description: parts.slice(1).join("—").replace(/^[•\s\-\*"`]+/, "").replace(/["`]$/, "").trim() };
      }
      return { name: `Элемент #${idx + 1}`, description: line.replace(/^[•\d\.\s\-\*"`]+/, "").replace(/["`]$/, "").trim() };
    });
  }

  return [];
}
