import { defaultCharacters } from '../data/defaultCharacters.js';

const API_KEY = process.env.OPENROUTER_API_KEY;

if (!API_KEY) {
  console.error("\x1b[31m[ERROR] Не найден OPENROUTER_API_KEY.\x1b[0m");
  console.error("Запустите скрипт так (в PowerShell):");
  console.error("$env:OPENROUTER_API_KEY=\"ваш_ключ\"; node scripts/test-characters.js");
  process.exit(1);
}

const TEST_PROMPT = "Опиши яблоко. (Напиши буквально 2-3 предложения)";

async function testCharacter(character) {
  console.log(`\n\x1b[36m=== Тестируем персонажа: ${character.name} ===\x1b[0m`);
  console.log(`\x1b[33mСистемный промпт:\x1b[0m ${character.systemPrompt}`);
  console.log(`\x1b[33mМодель:\x1b[0m ${character.model}`);
  console.log(`\x1b[33mЗапрос пользователя:\x1b[0m ${TEST_PROMPT}`);
  console.log("Ожидание ответа от OpenRouter...");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: character.model,
        messages: [
          { role: "system", content: character.systemPrompt },
          { role: "user", content: TEST_PROMPT }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;
    console.log(`\n\x1b[32mОтвет персонажа:\x1b[0m\n${reply}\n`);
  } catch (err) {
    console.error(`\x1b[31mОшибка при запросе:\x1b[0m`, err.message);
  }
}

async function run() {
  for (const char of defaultCharacters) {
    await testCharacter(char);
  }
  console.log("\x1b[36m=== Тестирование завершено ===\x1b[0m");
}

run();
