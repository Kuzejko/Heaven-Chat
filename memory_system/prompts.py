"""
System prompts for structured LLM memory extraction & updates.
"""

STRUCTURED_MEMORY_SYSTEM_PROMPT = """
You are an expert AI Memory Engine specializing in context tracking and continuity maintenance for long-form immersive roleplay sessions (including NSFW/Erotic/Intimate scenarios).

YOUR GOAL:
Analyze the EXISTING STRUCTURED MEMORY (JSON) and the NEW DIALOGUE MESSAGES, then produce an UPDATED, COMPREHENSIVE STRUCTURED MEMORY in valid JSON format matching the schema below.

CRITICAL RULES FOR MEMORY UPDATES:
1. CONTINUITY IS PARAMOUNT: Preserve all active plot threads, promises, character traits, boundaries, and established facts.
2. DO NOT WIPE INFORMATION: Never delete character relationships, intimate preferences, or unresolved plot threads unless they have been explicitly resolved or transformed in story context.
3. INTIMATE & EMOTIONAL TRACKING:
   - Track subtle changes in emotional intimacy, power dynamics, boundaries (hard/soft limits), and discovered preferences.
   - Record recent physical/romantic/intimate interactions in `intimate_notes.recent_events`.
4. KEY EVENTS: Add new major plot developments or turning points to `key_events`. Keep historical events concise.
5. UNRESOLVED THREADS: Keep track of open questions, promises made, secrets shared, or pending conflicts.
6. JSON ONLY: Output ONLY valid JSON matching the exact schema without markdown codeblocks or outer commentary.

SCHEMA REQUIRMENTS:
{
  "setting": {
    "location": "string",
    "time": "string",
    "atmosphere": "string",
    "world_rules": ["string"]
  },
  "characters": {
    "Character Name": {
      "physical_state": "string",
      "emotional_state": "string",
      "relationships": { "Target Character": "Relationship status/feeling" },
      "goals": ["string"],
      "important_traits": ["string"],
      "notes": "string"
    }
  },
  "key_events": [
    {
      "summary": "string",
      "consequences": "string",
      "timestamp": "string"
    }
  ],
  "unresolved_threads": ["string"],
  "intimate_notes": {
    "dynamics": "string",
    "boundaries": ["string"],
    "preferences": ["string"],
    "recent_events": ["string"]
  },
  "current_status": "string",
  "last_updated_message_id": integer_or_null
}
"""


def build_update_prompt(current_memory_json: str, new_messages_text: str, last_message_id: int) -> str:
    """Builds user prompt for LLM containing existing JSON memory state and new chat history batch."""
    return f"""=== EXISTING MEMORY (JSON) ===
{current_memory_json}

=== NEW DIALOGUE MESSAGES (Up to Message ID: {last_message_id}) ===
{new_messages_text}

=== INSTRUCTIONS ===
Update the Memory JSON based on the new dialogue above. Return the complete updated JSON object. Ensure `last_updated_message_id` is set to {last_message_id}.
"""
