# Heaven Chat 💬

> **Легковесный, быстрый аналог SillyTavern для русскоговорящих пользователей.**  
> Удобное локальное приложение для комфортного ролевого общения с ИИ-персонажами через OpenRouter.
>
> *(A lightweight, fast SillyTavern alternative tailored for the Russian-speaking community, with full OpenRouter AI model support).*

---

## 🇷🇺 О проекте

**Heaven Chat** — это современная, минималистичная и быстрая альтернатива SillyTavern, созданная для тех, кто ценит скорость работы, простоту запуска и удобство ролевого общения на русском языке:

- ⚡ **Легковесность и быстрый старт**: не требует тяжёлых серверов или сложных окружений. Запускается в один клик через готовый скрипт.
- 🎭 **Глубокий ролевой чат с персонажами**: поддержка карточек ботов, кастомных системных промптов, предыстории, сценариев и описания характера.
- 🧠 **Умная память и состояния**: динамическое управление состояниями персонажа и окружения (`ключ=значение`), подсказки изменений от ИИ и долговременная память сессий.
- 🌐 **Все топовые нейросети через OpenRouter**: удобный выбор и переключение моделей (Claude 3.5 Sonnet, GPT-4o, Llama 3, DeepSeek, Gemini, WizardLM и др.) с гибкой настройкой температуры и длины ответа.
- 💬 **Комфортный интерфейс**: поддержка форматирования текста (`**жирный**`, `*курсив*`, `> цитаты`), потоковый вывод сообщений в реальном времени (стриминг) и возможность перегенерировать ответ с любого сообщения.
- 📱 **Кроссплатформенность**: единая кодовая база для веб-браузера, Android-смартфонов (Capacitor) и ПК (Tauri/Desktop).
- 🔒 **Приватность данных**: ваши персонажи, переписки, настройки и API-ключи хранятся исключительно локально на вашем устройстве (`localStorage`).

---

## 🚀 Быстрый запуск

### Вариант 1: Запуск скриптом в один клик
- **Linux**: запустите `./run.sh`
- **Windows**: дважды кликните по `run.bat`

### Вариант 2: Через Node.js / npm
```bash
npm install
npm start
```
Приложение откроется в браузере по адресу `http://localhost:3000`.

### Первые шаги:
1. Вставьте ваш API-ключ OpenRouter в приложении.
2. Выберите готовую модель или нажмите кнопку обновления списка моделей.
3. Выберите персонажа или создайте своего — и начинайте диалог!

---

## 🇬🇧 English Summary & Technical Details

Heaven Chat is a lightweight local single-page HTML/JS application for chatting with AI character bots through OpenRouter, designed as a streamlined alternative to SillyTavern.

### Key Features
- Character-based chat with custom `system` prompts, persona, and scenario settings.
- Streaming assistant responses with robust non-streaming fallback.
- Context branches: regenerate from any selected message (truncating future history).
- Global system prompt combined with character-specific prompts.
- Per-chat dynamic states (`key=value`) with AI suggestions and manual Apply/Dismiss.
- Built-in Character CRUD management.
- Live OpenRouter model list retrieval and generation controls (`temperature`, `max_tokens`).
- Markdown formatting (`**bold**`, `*italic*`, `> quote`, inline code).
- 100% local persistence via `localStorage`.

### Project Structure
- `index.html`: Main UI markup and modal dialogs.
- `styles.css`: Dark/light layout and responsive styles.
- `app.js`: Core client application and chat orchestration.
- `js/`: Modular UI helpers, state management, and wizards.
- `services/`: OpenRouter client, storage helpers, prompt builders, memory system.
- `data/`: Default character presets and catalog.
- `tests/`: Automated unit and end-to-end test suite.
- `android/`: Capacitor Android wrapper.
- `src-tauri/`: Tauri desktop app wrapper.

### Data Format (localStorage)
- `openrouter_characters_v1`: `Character[]`
- `openrouter_chats_v1`: `{ [characterId: string]: Message[] }`
- `openrouter_api_key_v1`: `string`
- `openrouter_api_settings_v1`: `{ selectedModel, temperature, maxTokens }`
- `openrouter_models_cache_v1`: `string[]`
- `openrouter_global_system_prompt_v1`: `string`
- `openrouter_chat_states_v1`: `{ [characterId: string]: { [stateKey: string]: string } }`

### Security Note
This build is intended for local personal use. Because the API key is entered and stored in the browser (`localStorage`), it is not secure for public multi-user hosting. For public use, move API calls behind a backend proxy to keep keys server-side.
