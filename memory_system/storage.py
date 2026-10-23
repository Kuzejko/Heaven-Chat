import os
import json
import logging
from pathlib import Path
from typing import Union, Optional
from .models import MemorySchema

logger = logging.getLogger("MemoryStorage")


class MemoryStorage:
    """
    Handles JSON file persistence for MemorySchema.
    Supports safe loading, atomic saving, and manual edit tolerance.
    """

    def __init__(self, file_path: Union[str, Path]):
        self.file_path = Path(file_path)

    def exists(self) -> bool:
        """Checks if memory JSON file exists on disk."""
        return self.file_path.exists()

    def load(self) -> MemorySchema:
        """
        Loads memory from JSON file.
        If file does not exist or is corrupted, returns a new empty MemorySchema.
        """
        if not self.file_path.exists():
            logger.info(f"Memory file {self.file_path} not found. Creating default MemorySchema.")
            return MemorySchema()

        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            memory = MemorySchema.model_validate(data)
            logger.info(f"Loaded memory from {self.file_path} (last updated msg ID: {memory.last_updated_message_id})")
            return memory
        except Exception as e:
            logger.error(f"Failed to load memory file {self.file_path}: {e}. Returning fallback empty schema.")
            return MemorySchema()

    def save(self, memory: MemorySchema) -> None:
        """
        Saves MemorySchema to disk as formatted JSON.
        Uses atomic save pattern (temp file -> replace) to prevent corruption.
        """
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.file_path.with_suffix(".tmp")

        try:
            dict_data = memory.model_dump(mode="json")
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(dict_data, f, ensure_ascii=False, indent=2)
            
            os.replace(temp_path, self.file_path)
            logger.info(f"Successfully saved MemorySchema to {self.file_path}")
        except Exception as e:
            logger.error(f"Failed to save MemorySchema to {self.file_path}: {e}")
            if temp_path.exists():
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
            raise e
