// frontend/src/console/TaskEvents.tsx
import { useEffect } from "react";
import { subscribeEvents } from "../lib/bridge";

export function TaskEvents({ toast, appendLog }: { toast: (m: string) => void; appendLog: (m: string) => void; }) {
  useEffect(() => {
    return subscribeEvents((evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data);
        if (evt.type === "task.update") {
          appendLog(`Task ${data.id}: ${data.status}`);
          if (data.status === "running") toast(`Nexora executing task ${data.id}…`);
        }
        if (evt.type === "task.finished") {
          if (data.status === "success") {
            toast(`✅ Task ${data.id} completed`);
            appendLog(`✅ Task ${data.id} success ${JSON.stringify(data.result)}`);
          } else {
            toast(`❌ Task ${data.id} failed`);
            appendLog(`❌ Task ${data.id} error: ${data.error?.message}`);
          }
        }
      } catch { /* ignore */ }
    });
  }, []);
  return null;
}
