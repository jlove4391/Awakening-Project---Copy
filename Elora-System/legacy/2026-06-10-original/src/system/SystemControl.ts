/**
 * SystemControl.ts — Canonical system orchestrator for Vireon Core (Elora/Nexora)
 * - Vite/TypeScript compatible (no process.env; uses @ path alias)
 * - No secrets or backend API calls here
 * - Provides a single Wellspring (reflection) trigger for LearningCore/schedulers
 *
 * Dependencies expected:
 *  - "@/system/SystemDiagnostics": export async function runSystemDiagnostics(): Promise<DiagnosticsReport>
 *  - "@/utils/memoryEngine": export function loadMemory(): any[]; export function saveMemory(arr: any[]): void
 *  - "@/system/LogBus": export function logEvent(agent: Persona, channel: string, message: string, data?: unknown): void
 */

import { runSystemDiagnostics } from "@/system/SystemDiagnostics";
import { loadMemory, saveMemory } from "@/utils/memoryEngine";
// If your LogBus exports a different name (e.g., emitLog, bus.log), tweak this import line:
import { logEvent } from "@/system/LogBus";

// -----------------------------
// Types (lightweight on purpose)
// -----------------------------

export type Persona = "Elora" | "Nexora" | string;

export interface CommandContext {
  agent: Persona;
  payload?: Record<string, unknown>;
  // Optional flags for routing/security; expand as your roles/ACLs evolve
  role?: "sovereign" | "admin" | "operator" | "observer";
}

export interface CommandResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult>;

export interface DiagnosticsReport {
  ts: string;
  status: "ok" | "degraded" | "error";
  metrics: Record<string, number>;
  issues?: string[];
}

// --------------------------------------------------
// Internal command registry (allows easy extensions)
// --------------------------------------------------

const commandRegistry: Map<string, CommandHandler> = new Map();

/**
 * Register a new system command. Used internally to wire core commands and
 * externally to extend behavior (e.g., persona-specific commands).
 */
export function registerCommand(name: string, handler: CommandHandler) {
  commandRegistry.set(name.toLowerCase(), handler);
}

/** Return list of registered command names (for help/UX) */
export function getAvailableCommands(): string[] {
  return Array.from(commandRegistry.keys()).sort();
}

// ----------------------
// Core permission checks
// ----------------------

/** Minimal ACL — expand as needed for your Dynasty roles */
export function hasPermission(role: CommandContext["role"], command: string): boolean {
  const lowRisk = new Set(["help", "ping", "run_diagnostics", "wellspring"]);
  const opRisk = new Set(["delegate_tasks", "reset_system", "upgrade_persona"]);

  if (!role) return lowRisk.has(command.toLowerCase()); // default: safe set only
  if (role === "observer") return lowRisk.has(command.toLowerCase());
  if (role === "operator") return lowRisk.has(command.toLowerCase()) || opRisk.has(command.toLowerCase());
  if (role === "admin" || role === "sovereign") return true;
  return false;
}

// ----------------------------
// Canonical system-level calls
// ----------------------------

/** Lightweight "ping" command for smoke tests */
async function cmdPing(ctx: CommandContext): Promise<CommandResult> {
  logEvent(ctx.agent, "system", "pong");
  return { ok: true, message: "pong" };
}

/** Display available commands */
async function cmdHelp(ctx: CommandContext): Promise<CommandResult> {
  const list = getAvailableCommands();
  logEvent(ctx.agent, "system", "Available commands", { commands: list });
  return { ok: true, message: "Available commands", data: list };
}

/** Runs diagnostics via SystemDiagnostics and logs the result */
async function cmdRunDiagnostics(ctx: CommandContext): Promise<CommandResult> {
  logEvent(ctx.agent, "system", "Running diagnostics…");
  const report = await runSystemDiagnostics();
  logEvent(ctx.agent, "system", `Diagnostics: ${report.status}`, report);
  return { ok: true, message: `Diagnostics: ${report.status}`, data: report };
}

/** Placeholder: system safe reset (UI-level only) */
async function cmdResetSystem(ctx: CommandContext): Promise<CommandResult> {
  // Intentionally light; do NOT wipe persisted memory here.
  logEvent(ctx.agent, "system", "System reset triggered (soft/UI level).");
  return { ok: true, message: "System reset initiated (soft)." };
}

/** Placeholder: handle persona upgrade path (version, flags, toggles) */
async function cmdUpgradePersona(ctx: CommandContext): Promise<CommandResult> {
  const target = (ctx.payload?.persona as Persona) || ctx.agent;
  logEvent(ctx.agent, "system", `Upgrade requested for ${target}`, ctx.payload);
  // Implement your gated upgrade toggles here (feature flags, thresholds, etc.)
  return { ok: true, message: `Upgrade flow queued for ${target}` };
}

/** Delegate tasks (stub – wire to your real delegator if present) */
async function cmdDelegateTasks(ctx: CommandContext): Promise<CommandResult> {
  const tasks = (ctx.payload?.tasks as unknown[]) || [];
  logEvent(ctx.agent, "system", `Delegating ${tasks.length} task(s).`, { tasks });
  // Integrate with your actual executor/agent router here.
  return { ok: true, message: `Delegated ${tasks.length} task(s).`, data: { count: tasks.length } };
}

// ----------------------------------------------------------------------
// 🌊 Wellspring / Reflection Trigger — single-cycle self-assessment hook
// ----------------------------------------------------------------------

/**
 * Initiates a single Wellspring reflection cycle:
 *  1) Gather snapshot (memory/logs/state as applicable)
 *  2) Run diagnostics
 *  3) Append a reflection entry to memory
 *  4) Broadcast completion to LogBus
 *
 * This is intentionally small: LearningCore (your autonomous scheduler)
 * will call this on a cadence or when certain conditions are met.
 */
export async function initiateWellspring(agent: Persona = "Elora"): Promise<CommandResult> {
  logEvent(agent, "system", "🌊 Wellspring reflection cycle initiated.");

  try {
    // 1) Snapshot (use your existing memory structure; non-destructive read)
    const snapshot = Array.isArray(loadMemory()) ? loadMemory() : [];

    // 2) Diagnostics (health + metrics)
    const diagnostics = await runSystemDiagnostics();

    // 3) Compose a reflection record; keep it simple and serializable
    const reflection = {
      ts: new Date().toISOString(),
      agent,
      type: "reflection",
      summary: `Reflection complete — status: ${diagnostics.status}; entries: ${snapshot.length}`,
      diagnostics,
    };

    // 4) Persist
    const next = [...snapshot, reflection];
    saveMemory(next);

    // 5) Broadcast
    logEvent(agent, "system", "✅ Wellspring reflection stored.", { size: next.length });

    return { ok: true, message: "Wellspring cycle complete.", data: { diagnostics, size: next.length } };
  } catch (err: any) {
    logEvent(agent, "error", "Wellspring cycle failed.", { error: String(err?.message || err) });
    return { ok: false, message: "Wellspring cycle failed.", data: { error: String(err?.message || err) } };
  }
}

// -----------------------------
// Text-command entrypoint (UX)
// -----------------------------

/**
 * The single text command handler used by consoles/voice/UI.
 * Prefer calling programmatic functions (like initiateWellspring) from code,
 * but keep this for natural-language UX.
 */
export async function handleSystemCommand(command: string, ctx: CommandContext): Promise<CommandResult> {
  const key = command.trim().toLowerCase();

  if (!hasPermission(ctx.role, key)) {
    logEvent(ctx.agent, "warn", `Permission denied for command: ${key}`);
    return { ok: false, message: `Permission denied for ${key}` };
  }

  // First, check explicit registry handlers (extensible)
  const registered = commandRegistry.get(key);
  if (registered) return registered(ctx);

  // Fallback: built-in commands
  switch (key) {
    case "ping":
      return cmdPing(ctx);
    case "help":
      return cmdHelp(ctx);
    case "run_diagnostics":
    case "diagnostics":
      return cmdRunDiagnostics(ctx);
    case "reset_system":
    case "reset":
      return cmdResetSystem(ctx);
    case "upgrade_persona":
    case "upgrade":
      return cmdUpgradePersona(ctx);
    case "delegate_tasks":
    case "delegate":
      return cmdDelegateTasks(ctx);
    case "wellspring":
    case "reflect":
    case "reflection":
      return initiateWellspring(ctx.agent);
    default:
      logEvent(ctx.agent, "warn", `Unknown command: ${key}`);
      return { ok: false, message: `Unknown command: ${key}` };
  }
}

// ----------------------------------------
// Default export (handy for convenient use)
// ----------------------------------------

const SystemControl = {
  registerCommand,
  getAvailableCommands,
  hasPermission,
  handleSystemCommand,
  initiateWellspring,
};

export default SystemControl;
