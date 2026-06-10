// /src/utils/memoryEngine.js

const MEMORY_KEY = 'elora_memory_log';

export function saveMemory(memoryArray) {
  try {
    const data = JSON.stringify(memoryArray);
    localStorage.setItem(MEMORY_KEY, data);
  } catch (err) {
    console.error("Failed to save Elora memory:", err);
  }
}

export function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load Elora memory:", err);
    return [];
  }
}

export function clearMemory() {
  localStorage.removeItem(MEMORY_KEY);
}
