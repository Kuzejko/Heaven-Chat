import json
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import urllib.request
import urllib.error
import asyncio

logger = logging.getLogger("LLMProvider")


class BaseLLMProvider(ABC):
    """Abstract interface for LLM provider."""

    @abstractmethod
    async def generate(self, messages: List[Dict[str, str]], system_prompt: Optional[str] = None) -> str:
        """
        Executes a completion request given chat messages and an optional system prompt.
        Must return string response content.
        """
        pass


class OpenRouterLLMProvider(BaseLLMProvider):
    """
    LLM Provider for OpenRouter / OpenAI-compatible Chat Completion APIs.
    Supports any model hosted on OpenRouter or local Open-API endpoints (LM Studio, Kobold).
    """

    def __init__(
        self,
        api_key: str,
        model: str = "deepseek/deepseek-v4-flash",
        base_url: str = "https://openrouter.ai/api/v1/chat/completions",
        timeout: float = 60.0
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.timeout = timeout

    async def generate(self, messages: List[Dict[str, str]], system_prompt: Optional[str] = None) -> str:
        formatted_messages = []
        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt})
        formatted_messages.extend(messages)

        payload = {
            "model": self.model,
            "messages": formatted_messages,
            "temperature": 0.3,
            "response_format": {"type": "json_object"}
        }

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        # Run non-blocking HTTP request in executor thread using urllib
        def _request():
            req_data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(self.base_url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp_text = resp.read().decode("utf-8")
                return json.loads(resp_text)

        loop = asyncio.get_running_loop()
        try:
            res_data = await loop.run_in_executor(None, _request)
            content = res_data["choices"][0]["message"]["content"]
            return content
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8") if e.fp else ""
            logger.error(f"[OpenRouterLLMProvider] HTTP {e.code}: {err_body}")
            raise RuntimeError(f"LLM API Error {e.code}: {err_body}")
        except Exception as e:
            logger.error(f"[OpenRouterLLMProvider] Request failed: {e}")
            raise e


class MockLLMProvider(BaseLLMProvider):
    """Mock LLM provider for unit testing or demo without API calls."""

    def __init__(self, mock_response: Optional[str] = None):
        self.mock_response = mock_response

    async def generate(self, messages: List[Dict[str, str]], system_prompt: Optional[str] = None) -> str:
        if self.mock_response:
            return self.mock_response

        # Default mock JSON schema response
        return json.dumps({
            "setting": {
                "location": "Dark Forest Tavern",
                "time": "Midnight",
                "atmosphere": "Rainy and tense",
                "world_rules": ["Magic requires catalyst"]
            },
            "characters": {
                "Elena": {
                    "physical_state": "Slightly injured left arm",
                    "emotional_state": "Suspicious but curious",
                    "relationships": {"User": "Wary partner"},
                    "goals": ["Find the ancient map"],
                    "important_traits": ["Agile", "Perceptive"],
                    "notes": "Keeps hand on dagger"
                }
            },
            "key_events": [
                {
                    "summary": "Shared a table at the tavern and escaped guards",
                    "consequences": "Bound together by joint escape",
                    "timestamp": "Turn 5"
                }
            ],
            "unresolved_threads": ["Who betrayed them to the guards?"],
            "intimate_notes": {
                "dynamics": "Tense eye contact, growing mutual trust",
                "boundaries": ["No touch without permission"],
                "preferences": ["Whispered confessions"],
                "recent_events": ["User wrapped her injured arm in bandage"]
            },
            "current_status": "Hiding in the back alley after escaping guards",
            "last_updated_message_id": 10
        })
