require('dotenv').config();

// We need to polyfill fetch
if (!globalThis.fetch) {
  globalThis.fetch = require('node-fetch');
}

async function testApi() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    return;
  }
  
  const charName = "TestCharacter";
  const desc = "A cool vampire.";
  const behavior = "Drinks blood.";
  
  const prompt = `Напиши сценарий стартовой сцены (Scenario) для встречи пользователя {{user}} и персонажа {{char}} (по имени ${charName}).
Описание/Характер {{char}}: ${desc} ${behavior}
Опиши локацию, время суток, стартовую ситуацию и в каких отношениях они находятся на момент начала диалога. 
Используй макросы {{char}} и {{user}}.
КРИТИЧЕСКОЕ ПРАВИЛО: Пиши строго в третьем лице. НЕ используй прямую речь, диалоги или приветственные реплики персонажей. Это должно быть описание обстановки и начальных условий сцены (сценарий), а не первая реплика.
Пример правильного сценария: "{{user}} заходит в темную заброшенную библиотеку в полночь. За столом при свечах сидит {{char}} и читает книгу."
Ответь на русском языке. Объем: 2-3 предложения. Выведи ТОЛЬКО описание сценария.`;

  const requestBody = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    stream: false,
    temperature: 0.8,
    max_tokens: 250
  };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    const data = await res.json();
    console.log("Response:", data);
  } catch(e) {
    console.error("Error:", e);
  }
}

testApi();
