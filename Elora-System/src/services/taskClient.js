// Messenger between Elora's screen and the authBridge task backend.
const DEFAULT_BACKEND_URL = "http://127.0.0.1:4317";

const BACKEND_URL =
  process.env.REACT_APP_EXECUTION_BACKEND_URL || DEFAULT_BACKEND_URL;

function buildUrl(path) {
  return `${BACKEND_URL}${path}`;
}

async function readJsonResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.ok === false) {
    const message = data?.details || data?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function createTask(kind, payload) {
  const response = await fetch(buildUrl("/tasks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });

  return readJsonResponse(response);
}

export async function getTask(taskId) {
  const response = await fetch(buildUrl(`/tasks/${encodeURIComponent(taskId)}`));
  return readJsonResponse(response);
}

function parseEventData(event) {
  try {
    return JSON.parse(event.data);
  } catch (err) {
    return { error: "Could not read event data", raw: event.data };
  }
}

export function listenForTaskEvents(handlers = {}) {
  const events = new EventSource(buildUrl("/events"));

  events.addEventListener("task.update", (event) => {
    const data = parseEventData(event);
    if (handlers.onUpdate) handlers.onUpdate(data);
  });

  events.addEventListener("task.finished", (event) => {
    const data = parseEventData(event);
    if (handlers.onFinished) handlers.onFinished(data);
  });

  events.addEventListener("heartbeat", (event) => {
    const data = parseEventData(event);
    if (handlers.onHeartbeat) handlers.onHeartbeat(data);
  });

  events.onerror = (event) => {
    if (handlers.onError) handlers.onError(event);
  };

  // The caller can run this cleanup function when the screen no longer needs updates.
  return () => events.close();
}
