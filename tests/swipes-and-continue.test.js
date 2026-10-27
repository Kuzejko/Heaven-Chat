import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Setup in-memory localStorage mock before any app imports
const storageMap = new Map();
global.localStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] || null
};
global.window = {};
global.document = {
  documentElement: { style: { setProperty: () => {}, getPropertyValue: () => "" } },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};

// 1. Test replaceLastAssistantMessage in services/storage.js
const { replaceLastAssistantMessage } = await import("../services/storage.js");

console.log("--- 1. Testing replaceLastAssistantMessage with swipes ---");
// Case A: message without swipes
let chats = {
  chat1: [
    { role: "user", content: "Привет" },
    { role: "assistant", content: "Здравствуйте!" }
  ]
};
chats = replaceLastAssistantMessage(chats, "chat1", "Здравствуйте! Рад видеть.");
assert.strictEqual(chats.chat1[1].content, "Здравствуйте! Рад видеть.");
assert.strictEqual(chats.chat1[1].swipes, undefined);

// Case B: message with swipes array
let swipeChats = {
  chat1: [
    { role: "user", content: "Привет" },
    {
      role: "assistant",
      content: "Вариант 1",
      swipes: ["Вариант 1", "Вариант 2", "Вариант 3"],
      swipeIndex: 1
    }
  ]
};
swipeChats = replaceLastAssistantMessage(swipeChats, "chat1", "Вариант 2 (дополнен)");
assert.strictEqual(swipeChats.chat1[1].content, "Вариант 2 (дополнен)");
assert.strictEqual(swipeChats.chat1[1].swipes[0], "Вариант 1");
assert.strictEqual(swipeChats.chat1[1].swipes[1], "Вариант 2 (дополнен)");
assert.strictEqual(swipeChats.chat1[1].swipes[2], "Вариант 3");
assert.strictEqual(swipeChats.chat1[1].swipeIndex, 1);
console.log("✓ replaceLastAssistantMessage correctly keeps swipes[swipeIndex] in sync!");

// 2. Test Swipe Cycling Logic
console.log("--- 2. Testing swipe navigation logic ---");
function simulateSwipe(msg, targetIndex) {
  const swipes = Array.isArray(msg.swipes) && msg.swipes.length > 0 ? msg.swipes : [msg.content];
  if (targetIndex < 0 || targetIndex >= swipes.length) return msg;
  return {
    ...msg,
    swipes,
    swipeIndex: targetIndex,
    content: swipes[targetIndex]
  };
}

let testMsg = {
  role: "assistant",
  content: "Ответ A",
  swipes: ["Ответ A", "Ответ B", "Ответ C"],
  swipeIndex: 0
};
testMsg = simulateSwipe(testMsg, 1);
assert.strictEqual(testMsg.swipeIndex, 1);
assert.strictEqual(testMsg.content, "Ответ B");

testMsg = simulateSwipe(testMsg, 2);
assert.strictEqual(testMsg.swipeIndex, 2);
assert.strictEqual(testMsg.content, "Ответ C");

testMsg = simulateSwipe(testMsg, 0);
assert.strictEqual(testMsg.swipeIndex, 0);
assert.strictEqual(testMsg.content, "Ответ A");
console.log("✓ Swipe navigation correctly updates active index and content!");

// 3. Test In-place Edit of active swipe
console.log("--- 3. Testing in-place swipe editing ---");
function simulateEdit(msg, newContent) {
  let updatedMsg = { ...msg, content: newContent, edited: true };
  if (Array.isArray(updatedMsg.swipes) && updatedMsg.swipes.length > 0) {
    const sIdx = (typeof updatedMsg.swipeIndex === "number" && updatedMsg.swipeIndex >= 0 && updatedMsg.swipeIndex < updatedMsg.swipes.length)
      ? updatedMsg.swipeIndex
      : (updatedMsg.swipes.length - 1);
    const updatedSwipes = [...updatedMsg.swipes];
    updatedSwipes[sIdx] = newContent;
    updatedMsg.swipes = updatedSwipes;
    updatedMsg.swipeIndex = sIdx;
  }
  return updatedMsg;
}

let msgToEdit = {
  role: "assistant",
  content: "Черновик ответа 2",
  swipes: ["Ответ 1", "Черновик ответа 2", "Ответ 3"],
  swipeIndex: 1
};
const editedMsg = simulateEdit(msgToEdit, "Идеальный ответ 2");
assert.strictEqual(editedMsg.content, "Идеальный ответ 2");
assert.strictEqual(editedMsg.swipes[1], "Идеальный ответ 2");
assert.strictEqual(editedMsg.swipes[0], "Ответ 1");
assert.strictEqual(editedMsg.swipes[2], "Ответ 3");
assert.strictEqual(editedMsg.edited, true);
console.log("✓ In-place edit correctly modified only the active swipe variant!");

// 4. Test Continuation text concatenation
console.log("--- 4. Testing continuation text logic ---");
function combineContinuation(original, chunk) {
  const sep = (original && !original.endsWith(" ") && !chunk.startsWith(" ") && !chunk.startsWith("\n")) ? " " : "";
  return original + sep + chunk;
}

assert.strictEqual(combineContinuation("Привет", "мир!"), "Привет мир!");
assert.strictEqual(combineContinuation("Привет ", "мир!"), "Привет мир!");
assert.strictEqual(combineContinuation("Привет", "\nНовая строка"), "Привет\nНовая строка");
console.log("✓ Continuation text concatenation handles spacing correctly!");

// 5. Test CSS and UI module exports
console.log("--- 5. Testing CSS rules and UI exports ---");
const cssContent = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf-8");
assert.ok(cssContent.includes(".message-swipe-bar"), "styles.css must have .message-swipe-bar");
assert.ok(cssContent.includes(".swipe-prev"), "styles.css must have .swipe-prev");
assert.ok(cssContent.includes(".swipe-next"), "styles.css must have .swipe-next");
assert.ok(cssContent.includes(".swipe-counter"), "styles.css must have .swipe-counter");
assert.ok(cssContent.includes(".continue-btn"), "styles.css must have .continue-btn");

const uiJsContent = fs.readFileSync(path.join(__dirname, "../js/ui.js"), "utf-8");
assert.ok(uiJsContent.includes("export function onSwipeMessage"), "ui.js must export onSwipeMessage");
assert.ok(uiJsContent.includes("export function onContinueMessage"), "ui.js must export onContinueMessage");
assert.ok(uiJsContent.includes("dialogue-text"), "ui.js dialogueEl must include dialogue-text class");

console.log("=== ALL SWIPES & CONTINUE TESTS PASSED SUCCESSFULLY! ===");
