// frontend/src/elora/delegate.ts
import { createTask } from "../lib/bridge";

export async function eloraWriteFile(path: string, content: string) {
  const { id } = await createTask("fs.write", { path, content, overwrite: true });
  return id; // Elora can log "Task #id dispatched to Nexora"
}
