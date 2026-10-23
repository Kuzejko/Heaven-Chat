import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

from .models import MemorySchema, Message
from .storage import MemoryStorage
from .updater import UpdateStrategy
from .llm_provider import BaseLLMProvider
from .prompts import STRUCTURED_MEMORY_SYSTEM_PROMPT, build_update_prompt

logger = logging.getLogger("MemoryManager")


class MemoryManager:
    """
    Facade class managing structured RP session memory:
    - Message trajectory tracking
    - Dynamic memory update triggers & LLM calls
    - Safe persistence with manual edit tolerance
    - Context formatting for main model prompts
    """

    def __init__(
        self,
        llm_provider: BaseLLMProvider,
        storage_path: str = "./session_memory.json",
        turn_interval: int = 5,
        recent_messages_window: int = 10
    ):
        self.llm_provider = llm_provider
        self.storage = MemoryStorage(storage_path)
        self.strategy = UpdateStrategy(turn_interval=turn_interval)
        self.recent_messages_window = recent_messages_window

        self.messages: List[Message] = []
        self.memory: MemorySchema = self.storage.load()

    def add_message(self, role: str, content: str) -> Message:
        """Appends a new user or assistant message to the session history."""
        msg_id = len(self.messages) + 1
        msg = Message(id=msg_id, role=role, content=content)
        self.messages.append(msg)
        logger.info(f"Added message #{msg_id} ({role})")
        return msg

    def load_messages_history(self, messages_data: List[Dict[str, str]]) -> None:
        """Bulk loads message trajectory from existing chat log list."""
        self.messages = []
        for idx, m in enumerate(messages_data, start=1):
            self.messages.append(Message(id=idx, role=m.get("role", "user"), content=m.get("content", "")))
        logger.info(f"Loaded {len(self.messages)} messages into trajectory.")

    def reload_memory_from_disk(self) -> MemorySchema:
        """Reloads memory from disk to capture manual user JSON edits."""
        self.memory = self.storage.load()
        return self.memory

    def save_memory_to_disk(self) -> None:
        """Explicitly saves memory schema to disk."""
        self.storage.save(self.memory)

    async def update_memory_if_needed(self, force: bool = False) -> bool:
        """
        Checks if LLM memory update is triggered.
        If triggered, calls LLM, validates JSON, smart-merges, and saves to file.
        Returns True if memory was updated, False otherwise.
        """
        # Re-check disk in case user manually edited JSON between turns
        self.memory = self.storage.load()

        if not self.strategy.should_update(self.messages, self.memory, force=force):
            logger.debug("Memory update not required at this turn.")
            return False

        last_msg_id = self.messages[-1].id if self.messages else len(self.messages)
        start_msg_id = (self.memory.last_updated_message_id or 0) + 1

        unprocessed_msgs = [m for m in self.messages if m.id and m.id >= start_msg_id]
        if not unprocessed_msgs:
            return False

        new_history_text = "\n".join([f"[Msg #{m.id} - {m.role.upper()}]: {m.content}" for m in unprocessed_msgs])
        current_memory_json = json.dumps(self.memory.model_dump(mode="json"), ensure_ascii=False, indent=2)

        user_prompt = build_update_prompt(current_memory_json, new_history_text, last_msg_id)

        logger.info(f"Triggering LLM Memory Update for messages #{start_msg_id} -> #{last_msg_id}...")

        try:
            raw_response = await self.llm_provider.generate(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=STRUCTURED_MEMORY_SYSTEM_PROMPT
            )

            # Clean potential markdown code fences from LLM response
            cleaned_json = raw_response.strip()
            if cleaned_json.startswith("```json"):
                cleaned_json = cleaned_json[7:]
            if cleaned_json.startswith("```"):
                cleaned_json = cleaned_json[3:]
            if cleaned_json.endswith("```"):
                cleaned_json = cleaned_json[:-3]
            cleaned_json = cleaned_json.strip()

            parsed_dict = json.loads(cleaned_json)
            updated_schema = MemorySchema.model_validate(parsed_dict)

            # Smart merge with existing state (protecting manual edits & historical facts)
            self.memory = self.strategy.smart_merge(self.memory, updated_schema, last_msg_id)
            self.save_memory_to_disk()

            logger.info(f"Memory successfully updated & saved up to Msg #{last_msg_id}.")
            return True

        except Exception as e:
            logger.error(f"Failed to update structured memory: {e}", exc_info=True)
            return False

    def get_context_for_prompt(self, window_size: Optional[int] = None) -> Tuple[str, List[Dict[str, str]]]:
        """
        Returns the optimized context payload for the main roleplay LLM:
        1. Memory Markdown block (summary of setting, character states, intimate notes, key events)
        2. The last `N` raw chat messages for immediate conversational continuity.

        Returns: (system_memory_markdown, recent_messages_list)
        """
        win = window_size if window_size is not None else self.recent_messages_window
        recent_msgs = self.messages[-win:] if len(self.messages) > win else self.messages

        formatted_recent = [{"role": m.role, "content": m.content} for m in recent_msgs]
        memory_markdown = self.memory.to_markdown()

        return memory_markdown, formatted_recent
