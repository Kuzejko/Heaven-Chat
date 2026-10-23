import { state } from "./state.js";
import {
  dom,
  renderWizardChat,
  renderPromptWizardChat,
  showStateNotification,
  setStatus,
  updateStudioLivePreview
} from "./ui.js";
import { getEffectiveApiConfig } from "../services/apiHelper.js";
import { sendMessageNonStream } from "../services/openrouter.js";
import {
  saveCustomStateTypes,
  saveCustomStateStages,
  saveCharacters,
  saveGlobalSystemPrompt
} from "../services/storage.js";

export const RANDOM_CONCEPTS = [
  "Холодная и высокомерная эльфийка-чародейка, скрывающая сильные чувства к герою",
  "Дерзкая цундэрэ-напарница из гильдии авантюристов, вечно подшучивающая над спутником",
  "Преданный рыцарь-защитник Священного Ордена со строгим кодексом чести и скрытой печалью",
  "Гениальный киберпанк-хакер и уличный информатор в неоновом трущобном мегаполисе",
  "Древний вампир-аристократ в викторианском поместье, уставший от одиночества веков",
  "Заботливая целительница и травница из зачарованного леса с тайным магическим даром",
  "Опасная наемница и непревзойденный дуэлянт с саркастичным и циничным взглядом на мир",
  "Застенчивая библиотекарша запретной секции древней Академии Магии",
  "Строгая, но глубоко преданная капитан звездного крейсера в опасной исследовательской экспедиции",
  "Могущественный дракон, принявший человеческий облик и постигающий эмоции смертных",
  "Загадочная ведьма туманных болот, продающая зелья за необычную плату",
  "Детектив из нуарного города 1930-х годов с мрачным прошлым и верным револьвером",
  "Боевой андроид нового поколения, у которого внезапно пробудились человеческие чувства",
  "Гордая королева эльфов в осажденной горной цитадели",
  "Веселый и харизматичный бард-плут, вечно попадающий в любовные переделки",
  "Таинственный торговец артефактами из потустороннего измерения",
  "Безжалостный генерал темной империи, начавший сомневаться в своем правителе",
  "Мягкий и заботливый друг детства, ставший верховным архимагом",
  "Кицунэ-оборотень с девятью хвостами и игривым лукавым характером",
  "Скрытный убийца клана теней, поклявшийся защитить последнего свидетеля"
];

export function getRandomConcept() {
  const index = Math.floor(Math.random() * RANDOM_CONCEPTS.length);
  return RANDOM_CONCEPTS[index];
}

export function extractAndParseProfileJson(response) {
  if (!response || typeof response !== "string") return null;

  let jsonString = null;
  const matchFence = response.match(/```(?:json)?\s*\n?([\s\S]*?)(?:```|$)/i);
  if (matchFence && matchFence[1] && matchFence[1].trim().startsWith("{")) {
    jsonString = matchFence[1].trim();
  } else {
    const firstBrace = response.indexOf("{");
    if (firstBrace !== -1) {
      jsonString = response.slice(firstBrace).trim();
      const lastBrace = jsonString.lastIndexOf("}");
      if (lastBrace !== -1) {
        jsonString = jsonString.slice(0, lastBrace + 1);
      }
    }
  }

  if (!jsonString) return null;

  const cleanJson = (str) => {
    return str
      .replace(/,\s*([\}\]])/g, "$1")
      .replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
  };

  try {
    return JSON.parse(jsonString);
  } catch (e1) {
    try {
      return JSON.parse(cleanJson(jsonString));
    } catch (e2) {
      try {
        let repaired = cleanJson(jsonString);
        const quoteMatches = repaired.match(/"/g);
        if (quoteMatches && quoteMatches.length % 2 !== 0) {
          repaired += '"';
        }
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          repaired += "}".repeat(openBraces - closeBraces);
        }
        return JSON.parse(repaired);
      } catch (e3) {
        console.warn("[Wizard] JSON auto-repair failed, falling back to field extraction:", e3);
      }
    }
  }

  const fields = ["name", "gender", "description", "speech", "behavior", "appearance", "backstory", "scenario", "firstMessage", "systemPrompt", "personality"];
  const extracted = {};
  let foundAny = false;

  for (const field of fields) {
    const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
    const m = response.match(regex);
    if (m && m[1]) {
      extracted[field] = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      foundAny = true;
    }
  }

  return foundAny ? extracted : null;
}

/**
 * 1-Click AI Character Studio 2.0 Generator
 */
export async function generateCharacterStudioProfile(conceptText, customModel) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    throw new Error("Требуется API ключ. Укажите его в Настройках.");
  }
  
  const modelToUse = customModel || dom.wizardModelSelect?.value || apiConfig.model || "openai/gpt-4o-mini";
  const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";

  const systemInstruction = `You are a World-Class Character Designer and Master Roleplay Prompt Engineer.
Given a short concept or archetype, craft a rich, highly engaging, lifelike character profile for deep, immersive roleplay.

CRITICAL ROLEPLAY REQUIREMENTS:
1. "name": Authentic, fitting name (e.g. "Элеонора", "Виктор", "Кай", "Селеста").
2. "gender": "she/her" | "he/him" | "they/them".
3. "description": A captivating one-line bio/summary (e.g. "Холодная эльфийка-чародейка, скрывающая сильные чувства").
4. "traits": Array of 3 to 5 evocative trait tags in English (e.g. ["Cold", "Tsundere", "Intelligent", "Protective"]).
5. "appearance": Detailed physical description (face, hair, eyes, height, body, distinctive clothing, accessories).
6. "behavior": Deep psychological profile, habits, fears, hidden desires, how they treat the user.
7. "speech": Speech patterns, quirks, tone of voice, cadence, favorite expressions.
8. "scenario": The atmospheric starting setting and situation where {{char}} and {{user}} meet (in 3rd person, cinematic and rich, no dialogue).
9. "firstMessage": The opening dialogue greeting by {{char}}. MUST be vivid, sensory, immersive: use asterisks *...* for actions/inner physical expressions and double quotes "..." for speech.
10. "greetingVariants": Array of exactly 3 distinct greeting options:
    - [0]: Standard / Atmospheric & Tense
    - [1]: Emotional / Intimate / Vulnerable
    - [2]: Action-packed / Unexpected encounter
11. "systemPrompt": Specific instructions for AI model (speech style, tone, maintaining persona).

All descriptions, dialogue, and scenarios MUST be written in ${isRu ? "Russian" : "English"}.
Respond ONLY with a valid JSON object wrapped in \`\`\`json ... \`\`\` code fence.`;

  const userPrompt = `Создай глубокого, интересного персонажа на основе концепта:\n"${conceptText.trim()}"`;

  const messages = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt }
  ];

  console.log("[Studio] Generating character from concept...", { model: modelToUse, concept: conceptText });

  const response = await sendMessageNonStream({
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model: modelToUse,
    messages: messages,
    temperature: 0.75,
    maxTokens: 4000
  });

  const parsed = extractAndParseProfileJson(response);
  if (!parsed || (!parsed.name && !parsed.behavior && !parsed.description)) {
    throw new Error("Не удалось разобрать сгенерированный профиль. Попробуйте еще раз.");
  }

  return parsed;
}

/**
 * Generates 3 diverse greeting openers for the character
 */
export async function generateGreetingVariants(charData, count = 3) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    throw new Error("Требуется API ключ.");
  }
  
  const modelToUse = dom.wizardModelSelect?.value || apiConfig.model || "openai/gpt-4o-mini";
  const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";

  const systemInstruction = `You are a Master Roleplay Writer.
Generate exactly 3 diverse, highly engaging roleplay greeting openers for the given character.
Format rules:
- Describe actions and environment in asterisks *...*
- Put direct character speech in quotes "..."
- Write in ${isRu ? "Russian" : "English"}
- Return ONLY a JSON array of 3 strings inside \`\`\`json [ "...", "...", "..." ] \`\`\`

Variant 1: Atmospheric & Tense / Mysterious
Variant 2: Emotional / Intimate / Personal
Variant 3: Unexpected / Action-packed / Intriguing`;

  const userPrompt = `Character: ${charData.name || "Персонаж"}
Description: ${charData.description || ""}
Appearance: ${charData.appearance || ""}
Behavior: ${charData.behavior || ""}
Speech: ${charData.speech || ""}
Scenario: ${charData.scenario || ""}`;

  const messages = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt }
  ];

  const response = await sendMessageNonStream({
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model: modelToUse,
    messages: messages,
    temperature: 0.8,
    maxTokens: 1500
  });

  let match = response.match(/```(?:json)?\s*\n?(\[[\s\S]*?\])(?:```|$)/i);
  if (match) {
    try {
      const arr = JSON.parse(match[1]);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (e) {}
  }
  
  return [
    charData.firstMessage || "*Персонаж внимательно смотрит на вас.* \"Зачем ты пришел?\"",
    "*Заметив тебя, персонаж тихо выдыхает и делает шаг навстречу.* \"Я давно тебя жду...\"",
    "*Внезапный шум заставляет персонажа насторожиться.* \"Стой где стоишь! Кто ты такой?\""
  ];
}

/**
 * Applies smart modifiers to personality/behavior/speech
 */
export async function applySmartModifier(modifierType, charData) {
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    throw new Error("Требуется API ключ.");
  }

  const modelToUse = dom.wizardModelSelect?.value || apiConfig.model || "openai/gpt-4o-mini";
  const isRu = (state.apiSettings?.chatLanguage || "ru") === "ru";

  const modifierMap = {
    make_colder: "Сделай характер персонажа более сдержанным, холодным, отстраненным или высокомерным (кудэрэ/цундэрэ).",
    make_sweeter: "Сделай характер персонажа более мягким, заботливым, теплым и сочувствующим.",
    add_drama: "Добавь в характер и предысторию глубокую драму, скрытую боль или эмоциональное напряжение.",
    add_secret: "Добавь мрачную или интригующую тайну, которую персонаж тщательно скрывает от всех."
  };

  const instruction = modifierMap[modifierType] || "Улучши и сделай глубже характер персонажа.";

  const systemInstruction = `You are a Character Specialist.
Update the behavior, speech, and first message of the character according to the modification instruction:
"${instruction}"

Return ONLY a JSON object with:
\`\`\`json
{
  "behavior": "...",
  "speech": "...",
  "firstMessage": "..."
}
\`\`\`
Language: ${isRu ? "Russian" : "English"}.`;

  const userPrompt = `Current Character:
Name: ${charData.name || ""}
Behavior: ${charData.behavior || ""}
Speech: ${charData.speech || ""}
First Message: ${charData.firstMessage || ""}`;

  const messages = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt }
  ];

  const response = await sendMessageNonStream({
    apiKey: apiConfig.apiKey,
    baseUrl: apiConfig.baseUrl,
    model: modelToUse,
    messages: messages,
    temperature: 0.75,
    maxTokens: 2000
  });

  const parsed = extractAndParseProfileJson(response);
  return parsed || {};
}

/**
 * Fills the studio DOM fields from a profile object
 */
export function populateStudioFromProfile(profile) {
  if (!profile) return;

  if (dom.studioNameInput) dom.studioNameInput.value = profile.name || "";
  if (dom.studioGenderSelect) dom.studioGenderSelect.value = profile.gender || "she/her";
  if (dom.studioDescriptionInput) dom.studioDescriptionInput.value = profile.description || "";
  
  if (dom.studioTraitsInput) {
    if (Array.isArray(profile.traits)) {
      dom.studioTraitsInput.value = profile.traits.join(", ");
    } else if (typeof profile.traits === "string") {
      dom.studioTraitsInput.value = profile.traits;
    }
  }

  // Update active trait tag badges
  const traitsArr = (dom.studioTraitsInput?.value || "").split(",").map(t => t.trim().toLowerCase());
  document.querySelectorAll(".studio-trait-tag").forEach(tag => {
    const traitVal = (tag.dataset.trait || "").toLowerCase();
    if (traitsArr.includes(traitVal)) {
      tag.classList.add("active");
    } else {
      tag.classList.remove("active");
    }
  });

  if (profile.appearance !== undefined) dom.studioAppearanceInput.value = profile.appearance || "";
  if (profile.behavior !== undefined || profile.personality !== undefined) dom.studioBehaviorInput.value = profile.behavior || profile.personality || "";
  if (profile.speech !== undefined) dom.studioSpeechInput.value = profile.speech || "";
  if (profile.scenario !== undefined) dom.studioScenarioInput.value = profile.scenario || "";
  
  if (profile.avatarUrl) {
    if (dom.characterAvatarUrl) dom.characterAvatarUrl.value = profile.avatarUrl;
    if (dom.studioAvatarPreview) {
      dom.studioAvatarPreview.style.backgroundImage = `url("${profile.avatarUrl}")`;
      dom.studioAvatarPreview.textContent = "";
    }
  }

  if (profile.lorebook && Array.isArray(profile.lorebook)) {
    state.studioImportedLorebook = profile.lorebook;
  }
  if (profile.systemPrompt && dom.characterPrompt) {
    dom.characterPrompt.value = profile.systemPrompt;
  }
  if (profile.exampleDialogs && dom.characterExampleDialogs) {
    dom.characterExampleDialogs.value = profile.exampleDialogs;
  }
  if (profile.backstory && dom.characterBackstory) {
    dom.characterBackstory.value = profile.backstory;
  }

  const firstMsg = profile.firstMessage || profile.first_message || profile.greeting || "";
  if (dom.studioFirstMessageInput) dom.studioFirstMessageInput.value = firstMsg;

  // Handle greeting variants if present
  if (profile.greetingVariants && Array.isArray(profile.greetingVariants) && profile.greetingVariants.length > 0) {
    state.studioGreetingVariants = profile.greetingVariants;
    if (dom.greetingVariantsTabs) dom.greetingVariantsTabs.style.display = "flex";
    const tabBtns = document.querySelectorAll(".variant-tab-btn");
    tabBtns.forEach((btn, idx) => {
      btn.classList.toggle("active", idx === 0);
    });
  }

  updateStudioLivePreview();
}

/**
 * Collects current data from the Studio DOM inputs
 */
export function collectStudioData() {
  const traits = (dom.studioTraitsInput?.value || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const hiddenTraits = (dom.studioHiddenTraitsInput?.value || "")
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);

  const appearance = dom.studioAppearanceInput?.value.trim() || "";
  const behavior = dom.studioBehaviorInput?.value.trim() || "";
  const speech = dom.studioSpeechInput?.value.trim() || "";
  const backstory = dom.characterBackstory?.value.trim() || "";

  let compiledPersonality = "";
  if (appearance) compiledPersonality += `[Внешность]: ${appearance}\n`;
  if (behavior) compiledPersonality += `[Характер и поведение]: ${behavior}\n`;
  if (speech) compiledPersonality += `[Стиль общения]: ${speech}\n`;
  if (backstory) compiledPersonality += `[Предыстория]: ${backstory}\n`;

  return {
    name: dom.studioNameInput?.value.trim() || "Персонаж",
    gender: dom.studioGenderSelect?.value || "she/her",
    description: dom.studioDescriptionInput?.value.trim() || "",
    traits: traits,
    hiddenTraits: hiddenTraits,
    appearance: appearance,
    behavior: behavior,
    speech: speech,
    backstory: backstory,
    personality: compiledPersonality.trim() || behavior || "Персонаж",
    scenario: dom.studioScenarioInput?.value.trim() || "",
    firstMessage: dom.studioFirstMessageInput?.value.trim() || "",
    avatarUrl: dom.characterAvatarUrl?.value.trim() || "",
    systemPrompt: dom.characterPrompt?.value.trim() || "",
    exampleDialogs: dom.characterExampleDialogs?.value.trim() || "",
    lorebook: state.studioImportedLorebook || [],
    model: dom.wizardModelSelect?.value || state.apiSettings?.selectedModel || "openai/gpt-4o-mini"
  };
}

/**
 * Finalizes studio character creation, persists to storage, and starts chat
 */
export function finalizeStudioCharacter(charData, autoOpenChat = true, onFinalizeCallback) {
  const newId = `char_${Date.now()}`;
  const data = charData || collectStudioData();

  const coreStates = [
    {
      key: "affinity",
      displayName: "Отношение",
      defaultValue: 20,
      color: "purple",
      stages: ["Враждебность", "Холодность", "Нейтралитет", "Симпатия", "Влюбленность"]
    },
    {
      key: "mood",
      displayName: "Настроение",
      defaultValue: 50,
      color: "blue",
      stages: ["Ярость", "Раздражение", "Спокойствие", "Радость"]
    }
  ];

  const payload = {
    id: newId,
    name: data.name || "Персонаж",
    gender: data.gender || "she/her",
    description: data.description || "",
    traits: data.traits || [],
    appearance: data.appearance || "",
    behavior: data.behavior || "",
    speech: data.speech || "",
    backstory: data.backstory || "",
    personality: data.personality || data.behavior || "Персонаж",
    scenario: data.scenario || "",
    firstMessage: data.firstMessage || "",
    firstMessageMode: "assistant",
    avatarUrl: data.avatarUrl || "",
    exampleDialogs: data.exampleDialogs || "",
    model: data.model || state.apiSettings?.selectedModel || "openai/gpt-4o-mini",
    systemPrompt: data.systemPrompt || `Отыгрывай персонажа ${data.name}. Сохраняй стиль речи и характер. Описывай действия в звездочках *...* и диалоги в кавычках "..."`,
    coreStates: data.coreStates || coreStates,
    lorebook: data.lorebook || state.studioImportedLorebook || []
  };

  state.characters.push(payload);
  saveCharacters(state.characters);
  console.log("[Studio] New character created and saved:", payload);

  if (dom.adminDialog) dom.adminDialog.close();
  showStateNotification(`Персонаж «${payload.name}» успешно создан!`);
  setStatus(`Character ${payload.name} created.`);

  if (onFinalizeCallback) {
    onFinalizeCallback(newId);
  } else if (autoOpenChat && typeof window.selectCharacter === "function") {
    window.selectCharacter(newId);
  }
}

/**
 * Starts the Character Studio UI
 */
export function startCharacterWizard() {
  if (dom.characterForm) dom.characterForm.style.display = "none";
  if (dom.adminWizardView) dom.adminWizardView.style.display = "block";
  if (dom.studioFeedback) {
    dom.studioFeedback.style.display = "none";
    dom.studioFeedback.textContent = "";
  }
  
  // Set default concept placeholder if empty
  if (dom.studioConceptInput && !dom.studioConceptInput.value) {
    dom.studioConceptInput.value = "";
  }

  updateStudioLivePreview();
}

/**
 * Backwards-compatibility wrapper
 */
export async function handleWizardInput(onFinalizeCallback) {
  const concept = dom.studioConceptInput?.value.trim() || dom.wizardInput?.value.trim();
  if (!concept) return;

  if (dom.studioGenerateBtn) dom.studioGenerateBtn.disabled = true;
  if (dom.studioFeedback) {
    dom.studioFeedback.className = "studio-feedback";
    dom.studioFeedback.style.display = "flex";
    dom.studioFeedback.innerHTML = `<span>⏳</span> <span>Создаю профиль персонажа по вашей идее...</span>`;
  }

  try {
    const profile = await generateCharacterStudioProfile(concept);
    populateStudioFromProfile(profile);
    if (dom.studioFeedback) {
      dom.studioFeedback.innerHTML = `<span>✅</span> <span>Персонаж создан! Отредактируйте любые поля или нажмите «Сохранить и начать чат».</span>`;
    }
  } catch (err) {
    console.error("[Studio] Generation Error:", err);
    if (dom.studioFeedback) {
      dom.studioFeedback.className = "studio-feedback error";
      dom.studioFeedback.innerHTML = `<span>⚠️</span> <span>${err.message}</span>`;
    }
  } finally {
    if (dom.studioGenerateBtn) dom.studioGenerateBtn.disabled = false;
  }
}

export function finalizeWizardCharacter(profile, onFinalize) {
  return finalizeStudioCharacter(profile, true, onFinalize);
}

export function startPromptWizard() {
  const isRuWiz = (state.apiSettings?.chatLanguage || "ru") === "ru";
  state.promptWizardMessages = [{
    role: "assistant",
    content: isRuWiz
      ? "Привет! Я помощник по написанию системных промптов. Опишите, как должен вести себя ваш бот (какие правила, стиль речи, ограничения вы хотите добавить), и я составлю глобальный системный промпт."
      : "Hello! I'm your System Prompt assistant. Describe how you want your bot to behave (rules, speech style, restrictions), and I'll craft a global system prompt for you."
  }];
  
  if (dom.promptWizardApplyBtn) dom.promptWizardApplyBtn.style.display = "none";
  if (dom.promptWizardFeedback) dom.promptWizardFeedback.textContent = "";
  if (dom.promptWizardInput) dom.promptWizardInput.value = "";
  
  renderPromptWizardChat();
  if (dom.settingsDialog) {
    dom.settingsDialog.close();
  }
  if (dom.promptWizardDialog) {
    dom.promptWizardDialog.showModal();
  }
}

export async function handlePromptWizardInput() {
  const text = dom.promptWizardInput.value.trim();
  if (!text) return;
  
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    if (dom.promptWizardFeedback) dom.promptWizardFeedback.textContent = "API key required.";
    return;
  }
  
  dom.promptWizardInput.value = "";
  state.promptWizardMessages.push({ role: "user", content: text });
  renderPromptWizardChat();
  
  const isRuPW = (state.apiSettings?.chatLanguage || "ru") === "ru";
  const systemPromptInstruction = `You are a professional Prompt Engineer specializing in designing system prompts for AI roleplay characters and assistants.
Your goal is to help the user design a high-quality global system prompt (SYSTEM PROMPT) for their chat application.
Analyze the user's requirements and guide them, offering improvements.
When you draft or revise the system prompt, you MUST wrap it inside a code block tagged with "system_prompt", exactly like this:
\`\`\`system_prompt
[Here goes the generated system prompt]
\`\`\`
${isRuPW
  ? "Keep the chat in Russian, but write the system prompt in the language specified by the user (or in English/Russian as appropriate)."
  : "Keep the chat in English, but write the system prompt in the language specified by the user (or in English/Russian as appropriate)."
}
Always be encouraging, asking clarifying questions if their description is too brief.`;

  const messagesToSend = [
    { role: "system", content: systemPromptInstruction },
    ...state.promptWizardMessages
  ];

  if (dom.promptWizardSendBtn) dom.promptWizardSendBtn.disabled = true;
  if (dom.promptWizardFeedback) dom.promptWizardFeedback.textContent = "Составляю промпт...";
  
  try {
    const response = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      messages: messagesToSend,
      temperature: 0.7,
      maxTokens: 2500
    });
    
    state.promptWizardMessages.push({ role: "assistant", content: response });
    renderPromptWizardChat();
    if (dom.promptWizardFeedback) dom.promptWizardFeedback.textContent = "";
    
    const match = response.match(/```system_prompt\s*([\s\S]*?)(?:```|$)/i);
    if (match) {
      const generatedPrompt = match[1].trim();
      if (dom.promptWizardApplyBtn) {
        dom.promptWizardApplyBtn.style.display = "block";
        dom.promptWizardApplyBtn.onclick = () => {
          dom.globalSystemPromptInput.value = generatedPrompt;
          state.globalSystemPrompt = generatedPrompt;
          saveGlobalSystemPrompt(generatedPrompt);
          if (dom.promptWizardDialog) dom.promptWizardDialog.close();
          showStateNotification("Системный промпт применен!");
          setStatus("System prompt updated via wizard.");
        };
      }
      if (dom.promptWizardFeedback) dom.promptWizardFeedback.textContent = "Промпт готов! Нажмите кнопку ниже, чтобы применить его.";
    }
  } catch (err) {
    if (dom.promptWizardFeedback) dom.promptWizardFeedback.textContent = err.message;
  } finally {
    if (dom.promptWizardSendBtn) dom.promptWizardSendBtn.disabled = false;
  }
}

export function startCharacterRefineWizard() {
  const charName = dom.characterName?.value.trim() || "Персонаж";
  const isRuWiz = (state.apiSettings?.chatLanguage || "ru") === "ru";
  
  state.refineWizardMessages = [{
    role: "assistant",
    content: isRuWiz
      ? `Привет! Я помогу вам улучшить или скорректировать персонажа **${charName}**. Напишите, что именно вы хотите поправить, дополнить или изменить в его характере, стиле речи, внешности или предыстории!`
      : `Hello! I'm here to help refine or tweak **${charName}**. Tell me what you'd like to adjust, improve, or add to their personality, speech, backstory, or scenario!`
  }];
  
  if (dom.characterRefineApplyBtn) dom.characterRefineApplyBtn.style.display = "none";
  if (dom.characterRefineFeedback) dom.characterRefineFeedback.textContent = "";
  if (dom.characterRefineInput) dom.characterRefineInput.value = "";
  if (dom.characterRefineTitle) dom.characterRefineTitle.textContent = `🧙‍♂️ ИИ-Мастер доработки: ${charName}`;
  
  renderRefineWizardChat();
  if (dom.characterRefineDialog) {
    dom.characterRefineDialog.showModal();
  }
}

export function renderRefineWizardChat() {
  if (!dom.characterRefineChatHistory) return;
  dom.characterRefineChatHistory.innerHTML = "";
  (state.refineWizardMessages || []).forEach(msg => {
    const div = document.createElement("div");
    div.className = msg.role === "user" ? "wizard-msg user" : "wizard-msg assistant";
    div.style.padding = "8px 12px";
    div.style.borderRadius = "8px";
    div.style.fontSize = "12px";
    div.style.maxWidth = "85%";
    if (msg.role === "user") {
      div.style.alignSelf = "flex-end";
      div.style.background = "linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.05) 100%)";
      div.style.border = "1px solid rgba(255, 255, 255, 0.18)";
      div.style.color = "#ffffff";
    } else {
      div.style.alignSelf = "flex-start";
      div.style.background = "rgba(20, 20, 24, 0.85)";
      div.style.border = "1px solid rgba(255, 255, 255, 0.09)";
      div.style.color = "var(--text-primary)";
    }
    div.textContent = msg.content;
    dom.characterRefineChatHistory.appendChild(div);
  });
  dom.characterRefineChatHistory.scrollTop = dom.characterRefineChatHistory.scrollHeight;
}

export async function handleRefineWizardInput(onApplyCallback) {
  const text = dom.characterRefineInput?.value.trim();
  if (!text) return;
  
  const apiConfig = getEffectiveApiConfig(state.apiSettings, dom.apiKeyInput?.value);
  if (apiConfig.baseUrl === null && !apiConfig.apiKey) {
    if (dom.characterRefineFeedback) dom.characterRefineFeedback.textContent = "Требуется API ключ.";
    return;
  }

  const currentProfile = {
    name: dom.characterName?.value.trim() || "",
    gender: dom.characterGender?.value || "he/him",
    description: dom.characterDescription?.value.trim() || "",
    speech: dom.characterSpeech?.value.trim() || "",
    behavior: dom.characterBehavior?.value.trim() || "",
    appearance: dom.characterAppearance?.value.trim() || "",
    backstory: dom.characterBackstory?.value.trim() || "",
    scenario: dom.characterScenario?.value.trim() || "",
    firstMessage: dom.characterFirstMessage?.value.trim() || "",
    systemPrompt: dom.characterPrompt?.value.trim() || ""
  };
  
  dom.characterRefineInput.value = "";
  state.refineWizardMessages.push({ role: "user", content: text });
  renderRefineWizardChat();

  const isRuWiz = (state.apiSettings?.chatLanguage || "ru") === "ru";
  const systemPromptInstruction = `You are a Character Refinement Assistant.
Your task is to take the user's existing character profile and refine, tweak, or expand it according to their instructions.

CURRENT CHARACTER PROFILE:
\`\`\`json
${JSON.stringify(currentProfile, null, 2)}
\`\`\`

Instructions:
1. Provide a brief response (1-2 sentences) describing the changes.
2. Output the FULL updated JSON profile wrapped inside a code block tagged with "json". Ensure all fields are preserved and complete.

\`\`\`json
{
  "name": "...",
  "gender": "he/him | she/her | they/them",
  "description": "...",
  "speech": "...",
  "behavior": "...",
  "appearance": "...",
  "backstory": "...",
  "scenario": "...",
  "firstMessage": "...",
  "systemPrompt": "..."
}
\`\`\`
${isRuWiz ? "Write explanations in Russian." : "Write explanations in English."}`;

  const messagesToSend = [
    { role: "system", content: systemPromptInstruction },
    ...state.refineWizardMessages
  ];

  if (dom.characterRefineSendBtn) dom.characterRefineSendBtn.disabled = true;
  if (dom.characterRefineFeedback) dom.characterRefineFeedback.textContent = "Обновляю характеристики персонажа...";
  
  try {
    const response = await sendMessageNonStream({
      apiKey: apiConfig.apiKey,
      baseUrl: apiConfig.baseUrl,
      model: apiConfig.model,
      messages: messagesToSend,
      temperature: 0.7,
      maxTokens: 4000
    });

    state.refineWizardMessages.push({ role: "assistant", content: response });
    renderRefineWizardChat();

    const updatedProfile = extractAndParseProfileJson(response);
    if (updatedProfile && (updatedProfile.name || updatedProfile.description || updatedProfile.systemPrompt || updatedProfile.firstMessage || updatedProfile.personality)) {
      if (dom.characterRefineApplyBtn) {
        dom.characterRefineApplyBtn.style.display = "block";
        dom.characterRefineApplyBtn.onclick = () => applyRefinedProfileToForm(updatedProfile, onApplyCallback);
      }
      if (dom.characterRefineFeedback) {
        dom.characterRefineFeedback.textContent = "Изменения готовы! Нажмите кнопку ниже, чтобы применить и сохранить их.";
      }
    } else {
      console.warn("[RefineWizard] Failed to extract JSON profile from response:", response);
      if (dom.characterRefineFeedback) {
        dom.characterRefineFeedback.textContent = "Не удалось полностью распарсить профиль. Попробуйте уточнить запрос.";
      }
    }
  } catch (err) {
    console.error("[RefineWizard] API Error:", err);
    if (dom.characterRefineFeedback) dom.characterRefineFeedback.textContent = `Ошибка: ${err.message}`;
  } finally {
    if (dom.characterRefineSendBtn) dom.characterRefineSendBtn.disabled = false;
  }
}

export function applyRefinedProfileToForm(profile, onApply) {
  if (!profile) return;
  
  const setVal = (el, val) => {
    if (el && val !== undefined && val !== null && val !== "") {
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const targetId = dom.characterId?.value || state.activeCharacterId || (state.characters && state.characters[0] ? state.characters[0].id : null);
  if (dom.characterId && targetId) {
    dom.characterId.value = targetId;
  }

  if (profile.name) setVal(dom.characterName, profile.name);
  if (profile.gender) setVal(dom.characterGender, profile.gender);
  if (profile.description !== undefined) setVal(dom.characterDescription, profile.description);
  if (profile.speech !== undefined) setVal(dom.characterSpeech, profile.speech);
  
  const behaviorVal = profile.behavior || profile.personality || (dom.characterBehavior?.value ? dom.characterBehavior.value : "Характер и поведение");
  setVal(dom.characterBehavior, behaviorVal);
  if (profile.appearance !== undefined) setVal(dom.characterAppearance, profile.appearance);
  if (profile.backstory !== undefined) setVal(dom.characterBackstory, profile.backstory);
  
  const scenarioVal = profile.scenario || (dom.characterScenario?.value ? dom.characterScenario.value : "Сценарий ролевой игры");
  setVal(dom.characterScenario, scenarioVal);
  
  if (profile.firstMessage !== undefined) setVal(dom.characterFirstMessage, profile.firstMessage);
  if (profile.systemPrompt !== undefined) setVal(dom.characterPrompt, profile.systemPrompt);

  if (targetId && Array.isArray(state.characters)) {
    let charObj = state.characters.find(c => c.id === targetId);
    if (!charObj) {
      charObj = { id: targetId };
      state.characters.push(charObj);
    }
    if (profile.name) charObj.name = profile.name.trim();
    if (profile.gender) charObj.gender = profile.gender;
    if (profile.description !== undefined) charObj.description = profile.description.trim();
    if (profile.speech !== undefined) charObj.speech = profile.speech.trim();
    if (behaviorVal) charObj.behavior = behaviorVal.trim();
    if (profile.appearance !== undefined) charObj.appearance = profile.appearance.trim();
    if (profile.backstory !== undefined) charObj.backstory = profile.backstory.trim();
    if (scenarioVal) charObj.scenario = scenarioVal.trim();
    if (profile.firstMessage !== undefined) charObj.firstMessage = profile.firstMessage.trim();
    if (profile.systemPrompt !== undefined) charObj.systemPrompt = profile.systemPrompt.trim();

    let compiledPersonality = "";
    if (charObj.appearance) compiledPersonality += `[Внешность]: ${charObj.appearance}\n`;
    if (charObj.behavior) compiledPersonality += `[Характер и поведение]: ${charObj.behavior}\n`;
    if (charObj.backstory) compiledPersonality += `[Предыстория]: ${charObj.backstory}\n`;
    if (charObj.speech) compiledPersonality += `[Стиль общения]: ${charObj.speech}\n`;
    charObj.personality = compiledPersonality.trim() || charObj.behavior || profile.personality || charObj.personality || "Персонаж";

    saveCharacters(state.characters);
    console.log("[Wizard] Character directly updated in state and saved to storage:", charObj);
  }

  if (typeof onApply === "function") {
    try {
      onApply();
    } catch (err) {
      console.warn("[Wizard] Error executing onApply callback:", err);
    }
  }

  if (dom.characterRefineDialog) dom.characterRefineDialog.close();
  showStateNotification("Изменения от ИИ-Мастера успешно применены и сохранены!");
  setStatus("Character form updated and saved via AI Wizard.");
}
