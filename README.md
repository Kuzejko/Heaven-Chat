# Heaven Chat (Local MVP)

Local single-page HTML app for chatting with character bots through OpenRouter.

## Features

- Character-based chat with custom `system` prompts.
- Streaming assistant responses (with non-stream fallback).
- Regenerate from selected message (chat history is truncated from selected point).
- Global system prompt applied to every request.
- Per-chat dynamic states (`key=value`) with AI suggestions and manual Apply/Dismiss.
- Character CRUD admin panel in the UI.
- Live OpenRouter model list loading.
- API generation controls: `model`, `temperature`, `max_tokens`.
- Retry + timeout behavior for more resilient API calls.
- Rich message text formatting (`**bold**`, `*italic*`, `> quote`, inline code).
- Local persistence via `localStorage` for characters, chats, API key, and API settings.

## Run

Modern browsers block ES module loading via the `file://` protocol due to CORS security rules. To make running the app simple, you have three options:

### Option A: Direct script
- **Linux**: Run `./run.sh` or double-click `run.sh`
- **Windows**: Double-click `run.bat`

### Option B: npm start (CLI)
Run `npm start` in the project root directory.

### Option C: Serve manually
Serve the folder using any static web server (e.g. `npx http-server` or Python's `http.server`) and open `http://localhost:3000` (or the server's port) in your browser.

2. Paste your OpenRouter API key into the app.
3. Pick a character and start chatting.

## Project Files

- `index.html`: app markup and admin dialog.
- `styles.css`: layout and UI styles.
- `app.js`: UI logic, state handling, chat flow.
- `services/openrouter.js`: OpenRouter request and streaming parser.
- `services/storage.js`: `localStorage` persistence helpers.
- `data/defaultCharacters.js`: default character presets.

## Data Format (localStorage)

- `openrouter_characters_v1`: `Character[]`
- `openrouter_chats_v1`: `{ [characterId: string]: Message[] }`
- `openrouter_api_key_v1`: `string`
- `openrouter_api_settings_v1`: `{ selectedModel, temperature, maxTokens }`
- `openrouter_models_cache_v1`: `string[]`
- `openrouter_global_system_prompt_v1`: `string`
- `openrouter_chat_states_v1`: `{ [characterId: string]: { [stateKey: string]: string } }`

`Character`:

```txt
{
  id: string,
  name: string,
  personality: string, // required
  scenario: string, // required
  description: string,
  model: string,
  systemPrompt: string,
  firstMessage: string // optional
}
```

`Message`:

```txt
{
  role: "user" | "assistant",
  content: string,
  timestamp: number
}
```

## Security Note

This build is intended for local personal use. Because the API key is entered and stored in the browser, it is not secure for public deployment. For production/public use, move API calls behind a backend proxy and keep the key server-side.

## API Reliability Behavior

- Model list is loaded from `GET /api/v1/models`.
- Chat requests use timeout protection and retries for transient failures (`429`, `5xx`, network errors).
- Streaming remains the primary path; app falls back to non-stream response if stream fails.
- Last successful model list is cached locally and reused when model endpoint is unavailable.

## Prompt Merge Order

System context is merged in this order:
1. Global system prompt
2. Character system prompt
3. Serialized chat states block

## Dynamic State Suggestions

- You can manually add/update/remove states in the `States` panel (`key=value`).
- The assistant may suggest updates in a machine-readable block.
- Suggested updates appear in `AI suggested state updates`.
- `Apply` updates state immediately; `Dismiss` ignores suggestion.
- Suggestions are never auto-applied.

## Recommended Generation Values

- `temperature`: `0.3` to `1.0` for most use-cases.
- `max_tokens`: `256` to `1024` depending on desired answer length.

## Manual Test Checklist

- Enter API key, click `Refresh models`, verify model select is populated.
- Change `temperature` and `max_tokens`, send message, verify responses vary accordingly.
- Select a message in chat, click `Regenerate from here`, verify newer messages are replaced by a new AI answer.
- Set global prompt and a few states, send message, verify bot follows both.
- Verify AI suggestions can be applied/dismissed and persist after reload when applied.
- Temporarily disconnect network and verify clear error status appears.
- Re-open app and verify selected model/temperature/max tokens are restored.
- Trigger stream failure scenario and verify non-stream fallback still returns output.
