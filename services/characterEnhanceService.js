import { state } from "../js/state.js";
import { dom } from "../js/ui.js";
import { getEffectiveApiConfig } from "./apiHelper.js";
import { sendMessageNonStream } from "./openrouter.js";
import { extractAndParseProfileJson } from "../js/wizards.js";

export const ENHANCE_PRESETS = {
  balanced: {
    id: "balanced",
    label: "💎 Баланс и Глубина",
    description: "Гармоничное развитие: живой характер, психологическая достоверность, утонченные детали внешности и речи."
  },
  romance: {
    id: "romance",
    label: "🔥 Романтика и Чувственность (18+)",
    description: "Сильная эмоциональная и физическая химия, интимная динамика, магнетический флирт, чувственные детали и взрослые шкалы отношений."
  },
  lore: {
    id: "lore",
    label: "⚔️ Атмосфера и Лор",
    description: "Кинематографичная проза, глубокая проработка окружающего мира, тайны прошлого и эпичный контекст."
  },
  charisma: {
    id: "charisma",
    label: "🎭 Острый язык и Харизма",
    description: "Яркая индивидуальность, остроумный сарказм, фирменные фразы, психологические манипуляции и магнетизм."
  },
  dark: {
    id: "dark",
    label: "🖤 Темный нуар и Драма",
    description: "Внутренние демоны, психологические травмы, моральная неоднозначность и острый эмоциональный накал."
  }
};

/**
 * Builds the comprehensive prompt for character audit and enhancement.
 */
function buildEnhancePrompt(characterData, options = {}) {
  const isNsfw = Boolean(options.isNsfw);
  const stylePreset = options.stylePreset || (isNsfw ? "romance" : "balanced");
  const customInstructions = options.customInstructions ? options.customInstructions.trim() : "";

  let styleDirective = "";
  if (stylePreset === "romance") {
    styleDirective = `СТИЛЬ УЛУЧШЕНИЯ: «Романтика и Чувственность (18+)».
- Сделай акцент на невербальном флирте, магнетическом влечении, взглядах, запахах, полутонах и телесных реакциях.
- Создай захватывающую эмоциональную и физическую близость между {{char}} и {{user}}.`;
  } else if (stylePreset === "lore") {
    styleDirective = `СТИЛЬ УЛУЧШЕНИЯ: «Атмосфера и Лор».
- Сделай акцент на кинематографичности, окружении, звуках, запахах эпохи и захватывающих тайнах предыстории.`;
  } else if (stylePreset === "charisma") {
    styleDirective = `СТИЛЬ УЛУЧШЕНИЯ: «Острый язык и Харизма».
- Добавь персонажу неповторимый колорит речи, саркастичные или ироничные реплики, запоминающиеся привычки и уверенность.`;
  } else if (stylePreset === "dark") {
    styleDirective = `СТИЛЬ УЛУЧШЕНИЯ: «Темный нуар и Драма».
- Сделай акцент на внутренних конфликтах, психологических шрамах, уязвимостях и опасной ауре персонажа.`;
  } else {
    styleDirective = `СТИЛЬ УЛУЧШЕНИЯ: «Баланс и Глубина».
- Сбалансированное улучшение: психологическая достоверность, многогранность, устранение картонности и штампов.`;
  }

  let nsfwDirective = "";
  if (isNsfw) {
    nsfwDirective = `
РЕЖИМ 18+ (ADULT / MATURE / NSFW ROLEPLAY): ВКЛЮЧЕН.
- Раскрой персонажа во взрослом контексте: романтическое и сексуальное напряжение, чувственные тактильные описания (температура кожи, дыхание, учащенный пульс, близость тел, аромат, провокационные жесты).
- Персонаж не должен быть застенчивым ботом с цензурой. Допускается страсть, откровенность, ревность, флирт, раскрепощенность или доминантность в рамках его характера.
- В блоке coreStates ОБЯЗАТЕЛЬНО включи минимум 1-2 чувственные/интимные шкалы с 6 стадиями развития (например: «Страсть и Влечение», «Интимная близость», «Раскрепощенность»).
- Первое сообщение (firstMessage) должно создавать интимную или волнующую атмосферу с прямым контактом или сокращением дистанции с {{user}}.`;
  } else {
    nsfwDirective = `
РЕЖИМ 18+: ВЫКЛЮЧЕН.
- Сосредоточься на глубоком психологизме, литературном слоге, интересных чертах характера, дружбе, приключениях или тонкой романтике без откровенных 18+ сцен.`;
  }

  const systemInstruction = `Ты — ведущий эксперт по дизайну персонажей и архитектор промптов для текстовых ролевых игр.
Твоя задача — провести глубокий аудит (анализ слабых мест) представленного персонажа и сформировать его УЛУЧШЕННУЮ, обогащенную и живую версию на русском языке.

${styleDirective}
${nsfwDirective}
${customInstructions ? `ДОПОЛНИТЕЛЬНЫЕ ПОЖЕЛАНИЯ ПОЛЬЗОВАТЕЛЯ:\n${customInstructions}\n` : ""}

ПРАВИЛА И СТРУКТУРА ВЫХОДНОГО JSON:
Ответ ДОЛЖЕН быть строго в формате JSON, обернутом в блок \`\`\`json ... \`\`\`.
Схема JSON:
{
  "audit": {
    "summary": "Краткий емкий вывод аудита (что было слабым и как стало живым)",
    "weaknesses": [
      "Слабое место 1 (например: плоское описание внешности без сенсорных деталей)",
      "Слабое место 2 (например: шаблонные реплики без уникального говора)"
    ],
    "improvements": [
      "Что улучшено 1 (добавлены тактильные детали, запах, манера щуриться)",
      "Что улучшено 2 (прописан фирменный сарказм и динамические шкалы)"
    ]
  },
  "name": "Имя персонажа (сохранить или слегка облагородить)",
  "gender": "he/him" | "she/her" | "they/them",
  "description": "Емкое цепляющее описание (1-2 предложения, визитная карточка)",
  "appearance": "Богатое, кинематографичное описание внешности: лицо, глаза, телосложение, одежда, запахи, язык тела, характерные жесты.",
  "behavior": "Глубокая личность: привычки, страхи, скрытые желания, противоречия, истинное отношение к {{user}}.",
  "backstory": "Убедительная предыстория, личные тайны, ключевые события прошлого.",
  "speech": "Манера речи: интонации, темп, фирменные фразочки, слова-паразиты, обращение на «ты» или «вы», паузы.",
  "scenario": "Атмосферный сценарий завязки: время, место, почему {{char}} и {{user}} здесь, эмоциональный градус ситуации.",
  "firstMessage": "Выразительное первое сообщение. Используй *звездочки* для действий/окружения и \\"кавычки\\" для прямой речи. Сохраняй макросы {{user}} и {{char}}.",
  "traits": ["Черта 1", "Черта 2", "Черта 3", "Черта 4", "Черта 5"],
  "hiddenTraits": ["Скрытая черта 1", "Скрытая черта 2"],
  "coreStates": [
    {
      "key": "латинский_ключ_snake_case",
      "displayName": "Название шкалы на русском",
      "defaultValue": 20,
      "color": "#шестнадцатеричный_цвет",
      "stages": [
        "Стадия 0 (0-20): описание поведения",
        "Стадия 1 (21-40): описание поведения",
        "Стадия 2 (41-60): описание поведения",
        "Стадия 3 (61-80): описание поведения",
        "Стадия 4 (81-95): описание поведения",
        "Стадия 5 (96-100): описание поведения"
      ]
    }
  ]
}

ВАЖНО:
1. Сохраняй макросы {{user}} и {{char}} нетронутыми.
2. Не урезай оригинальную суть персонажа, а развивай и раскрывай ее на 200%.
3. Все тексты пиши на красивом, грамотном и живом русском языке без англицизмов.
4. В поле coreStates обязательно сформируй 2-4 интересные шкалы (каждая ровно с 6 стадиями от 0 до 5).`;

  // Format current character data for prompt
  const existingStatesText = Array.isArray(characterData.coreStates) && characterData.coreStates.length > 0
    ? characterData.coreStates.map(cs => `- ${cs.displayName || cs.key} (${cs.key}): [${(cs.stages || []).join(" | ")}]`).join("\n")
    : "Шкалы не заданы или стандартные.";

  const userContent = `Проанализируй и улучши следующую карточку персонажа:

ИМЯ: ${characterData.name || "Без имени"}
ПОЛ: ${characterData.gender || "не указан"}
КРАТКОЕ ОПИСАНИЕ: ${characterData.description || "Отсутствует"}
ТЕКУЩИЕ ТЕГИ / ЧЕРТЫ: ${(characterData.traits || []).join(", ") || "Нет"}
ВНЕШНОСТЬ: ${characterData.appearance || "Не задана отдельно"}
ХАРАКТЕР И ПОВЕДЕНИЕ: ${characterData.behavior || characterData.personality || "Не задан"}
ПРЕДЫСТОРИЯ: ${characterData.backstory || "Не задана"}
СТИЛЬ РЕЧИ: ${characterData.speech || "Не задан"}
СЦЕНАРИЙ: ${characterData.scenario || "Не задан"}
ПЕРВОЕ СООБЩЕНИЕ: ${characterData.firstMessage || "Не задано"}
ТЕКУЩИЕ ШКАЛЫ (CORE STATES):
${existingStatesText}
${characterData.hiddenTraits && characterData.hiddenTraits.length ? `СКРЫТЫЕ ЧЕРТЫ: ${characterData.hiddenTraits.join(", ")}` : ""}`;

  return { systemInstruction, userContent };
}

/**
 * Performs character analysis and enhancement using the active or selected AI model.
 * 
 * @param {Object} characterData - Source character object
 * @param {Object} options - { isNsfw: boolean, stylePreset: string, customInstructions: string, model: string }
 * @param {Function} [onProgress] - Optional progress callback
 * @returns {Promise<Object>} Enhanced character profile with audit data
 */
export async function analyzeAndEnhanceCharacter(characterData, options = {}, onProgress = null) {
  if (!characterData || (!characterData.name && !characterData.personality && !characterData.behavior)) {
    throw new Error("Недостаточно данных для анализа персонажа.");
  }

  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    throw new Error("Для работы улучшения через ИИ требуется API-ключ или локальная модель. Укажите их в Настройках.");
  }

  const modelToUse = options.model || apiConfig.model || "openai/gpt-4o-mini";

  if (typeof onProgress === "function") {
    onProgress("🔍 Анализируем профиль персонажа и выявляем слабые места...");
  }

  const { systemInstruction, userContent } = buildEnhancePrompt(characterData, options);

  const messages = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userContent }
  ];

  if (typeof onProgress === "function") {
    onProgress(options.isNsfw 
      ? "🔞 Создаем улучшенный профиль (режим 18+, углубление химии и чувственности)..." 
      : "✨ Обогащаем характер, стиль речи и первое сообщение персонажа...");
  }

  const responseText = await sendMessageNonStream({
    model: modelToUse,
    messages,
    temperature: options.isNsfw ? 0.78 : 0.72,
    maxTokens: 4000,
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl
  });

  if (!responseText || !responseText.trim()) {
    throw new Error("Нейросеть вернула пустой ответ. Попробуйте еще раз или выберите другую модель.");
  }

  if (typeof onProgress === "function") {
    onProgress("⚙️ Разбираем полученные улучшения и шкалы состояний...");
  }

  let parsed = extractAndParseProfileJson(responseText);

  if (!parsed || typeof parsed !== "object") {
    // If standard parser failed on nested fields, attempt direct JSON extraction
    try {
      const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
      parsed = JSON.parse(match[1].trim());
    } catch (e) {
      console.error("[CharacterEnhancer] Failed to parse JSON response:", responseText, e);
      throw new Error("Не удалось разобрать ответ нейросети в формате JSON. Попробуйте повторить генерацию.");
    }
  }

  // Ensure essential structure is present and sane
  const enhanced = {
    audit: parsed.audit || {
      summary: "Анализ завершен успешно.",
      weaknesses: ["Первоначальный профиль имел ограниченное описание."],
      improvements: ["Добавлены живые сенсорные детали, углублен характер и улучшено приветствие."]
    },
    id: characterData.id || `char_${Date.now()}`,
    name: parsed.name || characterData.name || "Персонаж",
    gender: parsed.gender || characterData.gender || "she/her",
    description: parsed.description || characterData.description || "",
    appearance: parsed.appearance || characterData.appearance || "",
    behavior: parsed.behavior || characterData.behavior || characterData.personality || "",
    backstory: parsed.backstory || characterData.backstory || "",
    speech: parsed.speech || characterData.speech || "",
    scenario: parsed.scenario || characterData.scenario || "",
    firstMessage: parsed.firstMessage || characterData.firstMessage || "",
    firstMessageMode: characterData.firstMessageMode || "assistant",
    traits: Array.isArray(parsed.traits) && parsed.traits.length ? parsed.traits : (characterData.traits || []),
    hiddenTraits: Array.isArray(parsed.hiddenTraits) && parsed.hiddenTraits.length ? parsed.hiddenTraits : (characterData.hiddenTraits || []),
    avatarUrl: characterData.avatarUrl || "",
    imagePrompt: parsed.imagePrompt || characterData.imagePrompt || "",
    model: characterData.model || "",
    systemPrompt: characterData.systemPrompt || "",
    exampleDialogs: characterData.exampleDialogs || "",
    lorebook: characterData.lorebook || [],
    coreStates: []
  };

  // Process coreStates
  if (Array.isArray(parsed.coreStates) && parsed.coreStates.length > 0) {
    enhanced.coreStates = parsed.coreStates.map((cs, idx) => {
      const key = String(cs.key || `state_${idx + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "");
      const displayName = cs.displayName || cs.name || `Шкала ${idx + 1}`;
      const defaultValue = typeof cs.defaultValue === "number" ? cs.defaultValue : 20;
      const color = cs.color && cs.color.startsWith("#") ? cs.color : (idx === 0 ? "#ffffff" : (idx === 1 ? "#e4e4e7" : "#a1a1aa"));
      
      let stages = Array.isArray(cs.stages) ? cs.stages : [];
      if (stages.length < 6) {
        while (stages.length < 6) {
          stages.push(`Стадия ${stages.length}: обычное поведение`);
        }
      } else if (stages.length > 6) {
        stages = stages.slice(0, 6);
      }

      return { key, displayName, defaultValue, color, stages };
    });
  } else if (Array.isArray(characterData.coreStates) && characterData.coreStates.length > 0) {
    enhanced.coreStates = characterData.coreStates;
  }

  // Compile combined personality
  let compiledPersonality = "";
  if (enhanced.appearance) compiledPersonality += `[Внешность]: ${enhanced.appearance}\n`;
  if (enhanced.behavior) compiledPersonality += `[Характер и поведение]: ${enhanced.behavior}\n`;
  if (enhanced.backstory) compiledPersonality += `[Предыстория]: ${enhanced.backstory}\n`;
  if (enhanced.speech) compiledPersonality += `[Стиль общения]: ${enhanced.speech}\n`;
  enhanced.personality = compiledPersonality.trim() || enhanced.behavior;

  return enhanced;
}
