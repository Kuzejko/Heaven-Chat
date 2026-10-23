import logging
from typing import List, Dict, Set
from .models import MemorySchema, Message, CharacterState, IntimateNotes

logger = logging.getLogger("MemoryUpdater")


class UpdateStrategy:
    """
    Decides when memory updates should trigger and handles non-destructive merging 
    between existing memory (including manual edits) and LLM-generated memory updates.
    """

    def __init__(self, turn_interval: int = 5, min_unprocessed_messages: int = 3):
        self.turn_interval = turn_interval
        self.min_unprocessed_messages = min_unprocessed_messages

    def should_update(self, messages: List[Message], current_memory: MemorySchema, force: bool = False) -> bool:
        """
        Determines whether memory needs to be updated by LLM.
        """
        if force:
            return True

        if not messages:
            return False

        last_msg_id = messages[-1].id if messages[-1].id is not None else len(messages)
        last_updated_id = current_memory.last_updated_message_id or 0

        unprocessed_count = last_msg_id - last_updated_id

        if unprocessed_count < self.min_unprocessed_messages:
            return False

        if unprocessed_count >= self.turn_interval:
            return True

        return False

    def smart_merge(self, existing: MemorySchema, updated: MemorySchema, last_msg_id: int) -> MemorySchema:
        """
        Merges new LLM-generated memory into existing memory without dropping manual edits or historical facts.
        """
        merged_setting = updated.setting if (updated.setting.location or updated.setting.time) else existing.setting

        # Merge Characters: keep characters that were in existing even if LLM omitted them
        merged_characters: Dict[str, CharacterState] = {}
        all_char_names: Set[str] = set(existing.characters.keys()).union(set(updated.characters.keys()))

        for name in all_char_names:
            old_char = existing.characters.get(name)
            new_char = updated.characters.get(name)

            if old_char and not new_char:
                merged_characters[name] = old_char
            elif new_char and not old_char:
                merged_characters[name] = new_char
            else:
                # Both exist: merge fields intelligently
                rel = {**old_char.relationships, **new_char.relationships}
                goals = list(dict.fromkeys(old_char.goals + new_char.goals))
                traits = list(dict.fromkeys(old_char.important_traits + new_char.important_traits))

                merged_characters[name] = CharacterState(
                    physical_state=new_char.physical_state or old_char.physical_state,
                    emotional_state=new_char.emotional_state or old_char.emotional_state,
                    relationships=rel,
                    goals=goals,
                    important_traits=traits,
                    notes=new_char.notes or old_char.notes
                )

        # Merge Key Events: accumulate non-duplicate summaries
        existing_summaries = {e.summary for e in existing.key_events}
        merged_events = list(existing.key_events)
        for ev in updated.key_events:
            if ev.summary not in existing_summaries:
                merged_events.append(ev)
                existing_summaries.add(ev.summary)

        # Merge Unresolved Threads
        merged_threads = list(dict.fromkeys(existing.unresolved_threads + updated.unresolved_threads))

        # Merge Intimate Notes
        old_im = existing.intimate_notes
        new_im = updated.intimate_notes
        merged_im = IntimateNotes(
            dynamics=new_im.dynamics or old_im.dynamics,
            boundaries=list(dict.fromkeys(old_im.boundaries + new_im.boundaries)),
            preferences=list(dict.fromkeys(old_im.preferences + new_im.preferences)),
            recent_events=list(dict.fromkeys(old_im.recent_events + new_im.recent_events))
        )

        return MemorySchema(
            setting=merged_setting,
            characters=merged_characters,
            key_events=merged_events,
            unresolved_threads=merged_threads,
            intimate_notes=merged_im,
            current_status=updated.current_status or existing.current_status,
            last_updated_message_id=last_msg_id
        )
