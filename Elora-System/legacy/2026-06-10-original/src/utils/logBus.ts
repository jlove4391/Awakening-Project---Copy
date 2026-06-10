// /src/utils/logBus.js

const logMemory = [];

class LogBus {
  constructor() {
    this.listeners = [];
  }

  emit(logEntry) {
    const enrichedEntry = {
      ...logEntry,
      timestamp: logEntry.timestamp || Date.now()
    };

    logMemory.push(enrichedEntry);

    this.listeners.forEach((cb) => cb(enrichedEntry));
  }

  subscribe(cb) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
  }
}

export const logBus = new LogBus();

export function logEvent(source, type, content) {
  logBus.emit({
    source,
    type,
    content,
    timestamp: Date.now()
  });
}

export function getLogHistory() {
  return [...logMemory];
}
