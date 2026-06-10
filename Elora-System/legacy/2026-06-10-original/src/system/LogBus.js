// /src/utils/logBus.js

class LogBus {
  constructor() {
    this.listeners = [];
  }

  emit(logEntry) {
    const enrichedEntry = {
      ...logEntry,
      timestamp: logEntry.timestamp || Date.now()
    };

    // Broadcast to in-app listeners
    this.listeners.forEach((cb) => cb(enrichedEntry));

    // [Optional] External persistence or server relay can go here
    // console.log("📤 Sending log externally:", enrichedEntry);
  }

  subscribe(cb) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
  }
}

export const logBus = new LogBus();

// 🔹 Helper for all components to use standard log format
export function logEvent(source, type, content) {
  logBus.emit({
    source,
    type,
    content,
    timestamp: Date.now()
  });
}
