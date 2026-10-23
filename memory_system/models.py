from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class Message(BaseModel):
    """Represents a single chat message in the session trajectory."""
    id: Optional[int] = None
    role: str = Field(..., description="Role of the sender: 'user', 'assistant', 'system'")
    content: str = Field(..., description="Raw text content of the message")
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat(), description="ISO timestamp of message creation")


class Setting(BaseModel):
    """Current environmental, spatial, and temporal state of the scene."""
    location: str = Field(default="", description="Current location/room/environment")
    time: str = Field(default="", description="Time of day, date, or epoch in story world")
    atmosphere: str = Field(default="", description="Mood, lighting, sensory details of setting")
    world_rules: List[str] = Field(default_factory=list, description="Active lore constraints or physical laws")


class CharacterState(BaseModel):
    """Detailed state for a single character in the story."""
    physical_state: str = Field(default="", description="Health, exhaustion, clothing status, injuries")
    emotional_state: str = Field(default="", description="Current feelings, mood, internal stress level")
    relationships: Dict[str, str] = Field(default_factory=dict, description="Status/feeling towards other characters (e.g. {'User': 'Trusting but cautious'})")
    goals: List[str] = Field(default_factory=list, description="Short-term or long-term desires of the character")
    important_traits: List[str] = Field(default_factory=list, description="Personality highlights or permanent traits")
    notes: str = Field(default="", description="Additional relevant context or secrets")


class KeyEvent(BaseModel):
    """Significant story beat or action that affects continuity."""
    summary: str = Field(..., description="Short summary of what happened")
    consequences: str = Field(default="", description="Impact on characters or story trajectory")
    timestamp: str = Field(default="", description="When the event occurred in story time or turn index")


class IntimateNotes(BaseModel):
    """Specialized memory for emotional, romantic, and intimate dynamics."""
    dynamics: str = Field(default="", description="Power balance, intimacy stage, emotional warmth")
    boundaries: List[str] = Field(default_factory=list, description="Established hard/soft limits or taboos")
    preferences: List[str] = Field(default_factory=list, description="Discovered likes, triggers, or turn-ons")
    recent_events: List[str] = Field(default_factory=list, description="Recent intimate or romantic highlights")


class MemorySchema(BaseModel):
    """Structured memory schema for LLM roleplay sessions."""
    setting: Setting = Field(default_factory=Setting)
    characters: Dict[str, CharacterState] = Field(default_factory=dict)
    key_events: List[KeyEvent] = Field(default_factory=list)
    unresolved_threads: List[str] = Field(default_factory=list, description="Open plot hooks, promises, unresolved conflicts")
    intimate_notes: IntimateNotes = Field(default_factory=IntimateNotes)
    current_status: str = Field(default="", description="One-line summary of immediate situational status")
    last_updated_message_id: Optional[int] = Field(default=None, description="Message ID up to which memory has been updated")

    def to_markdown(self) -> str:
        """Formats structured memory into a clean, compact Markdown block for LLM prompt context."""
        lines = ["# 🧠 STRUCTURED MEMORY CONTEXT"]
        
        # Setting
        s = self.setting
        if s.location or s.time or s.atmosphere:
            lines.append("\n## 📍 Setting & Atmosphere")
            if s.location: lines.append(f"- **Location**: {s.location}")
            if s.time: lines.append(f"- **Time**: {s.time}")
            if s.atmosphere: lines.append(f"- **Atmosphere**: {s.atmosphere}")
            if s.world_rules: lines.append(f"- **World Rules**: {', '.join(s.world_rules)}")
        
        # Current status
        if self.current_status:
            lines.append(f"\n## ⚡ Current Situation\n{self.current_status}")

        # Characters
        if self.characters:
            lines.append("\n## 👥 Character States & Relationships")
            for name, char in self.characters.items():
                lines.append(f"### {name}")
                if char.physical_state: lines.append(f"- **Physical**: {char.physical_state}")
                if char.emotional_state: lines.append(f"- **Emotional**: {char.emotional_state}")
                if char.relationships:
                    rel_str = ", ".join([f"{k}: {v}" for k, v in char.relationships.items()])
                    lines.append(f"- **Relationships**: {rel_str}")
                if char.goals: lines.append(f"- **Goals**: {', '.join(char.goals)}")
                if char.important_traits: lines.append(f"- **Traits**: {', '.join(char.important_traits)}")
                if char.notes: lines.append(f"- **Notes**: {char.notes}")

        # Intimate Notes
        im = self.intimate_notes
        if im.dynamics or im.boundaries or im.preferences or im.recent_events:
            lines.append("\n## 💖 Intimate & Relationship Dynamics")
            if im.dynamics: lines.append(f"- **Dynamics**: {im.dynamics}")
            if im.boundaries: lines.append(f"- **Boundaries**: {', '.join(im.boundaries)}")
            if im.preferences: lines.append(f"- **Preferences**: {', '.join(im.preferences)}")
            if im.recent_events: lines.append(f"- **Recent Highlights**: {', '.join(im.recent_events)}")

        # Unresolved Threads
        if self.unresolved_threads:
            lines.append("\n## 📌 Unresolved Plot Threads & Promises")
            for thread in self.unresolved_threads:
                lines.append(f"- {thread}")

        # Key Events
        if self.key_events:
            lines.append("\n## 📜 Key Story Events")
            for ev in self.key_events[-5:]:  # Include up to 5 most recent key events
                conseq = f" (Impact: {ev.consequences})" if ev.consequences else ""
                lines.append(f"- {ev.summary}{conseq}")

        return "\n".join(lines)
