import sys
import asyncio
import json
import logging
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from memory_system.models import MemorySchema
from memory_system.memory_manager import MemoryManager
from memory_system.llm_provider import MockLLMProvider, OpenRouterLLMProvider

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


async def run_demo():
    print("=== Starting Structured Memory System Demo ===\n")
    
    storage_file = Path("./demo_session_memory.json")
    if storage_file.exists():
        storage_file.unlink()

    # 1. Initialize MemoryManager with MockLLMProvider (or OpenRouter if API key provided)
    llm = MockLLMProvider()
    manager = MemoryManager(
        llm_provider=llm,
        storage_path=str(storage_file),
        turn_interval=5,
        recent_messages_window=3
    )

    # 2. Simulate dialogue trajectory
    print("💬 Adding dialogue messages...")
    manager.add_message("user", "Привет! Мы с Еленой пришли в таверну 'Темный лес'. На улице дождливо.")
    manager.add_message("assistant", "Елена оглядывает тусклый зал таверны, ее рука нервно лежит на рукояти кинжала. 'Здесь неуютно,' — шепчет она.")
    manager.add_message("user", "Я бережно подхожу к ней и аккуратно обнимаю за плечи: 'Не бойся, я рядом'.")
    manager.add_message("assistant", "Она вдрагивает от неожиданности, но затем расслабляется, прижимаясь к тебе. 'Спасибо... Но держи ухо востро.'")
    manager.add_message("user", "Внезапно стражники врываются в таверну! Мы выбегаем через задний двор.")

    # 3. Check memory update
    print("\n🔄 Evaluating memory update trigger (Message #5)...")
    updated = await manager.update_memory_if_needed()
    print(f"Memory updated: {updated}")

    # 4. Add more messages
    manager.add_message("assistant", "Мы тяжело дышим в темном переулке. Елена аккуратно перевязывает твою руку: 'Ты спасаешь меня уже второй раз.'")
    manager.add_message("user", "Я смотря ей в глаза, тихо произношу: 'Я всегда защищу тебя, обещаю.'")

    # 5. Force memory update for latest state
    print("\n🔄 Forcing memory update (Message #7)...")
    await manager.update_memory_if_needed(force=True)

    # 6. Retrieve compiled context for main RP LLM prompt
    print("\n=== 📑 COMPILED CONTEXT FOR MAIN LLM PROMPT ===")
    memory_markdown, recent_messages = manager.get_context_for_prompt(window_size=3)
    
    print(memory_markdown)
    print("\n--- RECENT RAW MESSAGES (Window Size = 3) ---")
    for m in recent_messages:
        print(f"[{m['role'].upper()}]: {m['content']}")

    # 7. Print raw saved JSON
    print("\n=== 💾 SAVED JSON FILE CONTENT (demo_session_memory.json) ===")
    with open(storage_file, "r", encoding="utf-8") as f:
        print(f.read())


if __name__ == "__main__":
    asyncio.run(run_demo())
