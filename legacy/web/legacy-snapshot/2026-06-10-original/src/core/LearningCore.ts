/**
 * LearningCore.ts — autonomous Wellspring scheduler (singular file)
 *
 * Purpose
 * - Calls SystemControl.initiateWellspring() on a cadence
 * - Debounces runs so we never spam cycles
 * - Persists last-run timestamps to survive reloads
 * - Triggers on tab focus regain (optional, configurable)
 * - Zero external deps, Vite/TS ready, browser-safe
 *
 * Assumptions / Imports
 * - "@/system/SystemControl": export async function initiateWellspring(agent?: string)
 * - "@/system/LogBus": export function logEvent(agent: string, channel: string, message: string, data?: unknown)
 *
 * Nothing here touches secrets or backend keys.
 */

import { initiateWellspring } from "@/system/SystemControl";
import { logEvent } from "@/system/LogBus";

// -----------------------------
// Types & constants
// -----------------------------

export type Persona = "Elora" | "Nexora" | string;

export interface LearningCoreConfig {
  enabled: boolean;
  /** Minimum gap between autonomous runs (minutes). */
  minIntervalMinutes: number;
  /** Max steps per continuous loop, safety guard for back-to-back triggers. */
  maxStepsPerCycle: number;
  /** Which persona “thinks” the reflection by default. */
  persona: Persona;
  /** Run a cycle shortly after the page regains focus, if allowed by interval gate. */
  runOnFocusRegain: boolean;
  /** Delay after focus regain before attempting (ms). Default 7.5s */
  focusRegainDelayMs?: number;
  /** Optional hook for telemetry or UI badges. */
  onCycle?: (info: CycleEvent) => void;
}

export interface CycleEvent {
  kind: "scheduled-start" | "manual-start" | "skipped" | "success" | "error";
  reason?: string;
  at: string; // ISO time
  agent: Persona;
  nextAttemptInMs?: number;
  error?: string;
}

const STORAGE_KEYS = {
  lastRun: "wellspring:lastRun",
  lastReason: "wellspring:lastReason",
  runCount: "wellspring:runCount",
};

const DEFAULTS: LearningCoreConfig = {
  enabled: true,
  minIntervalMinutes: 15,
  maxStepsPerCycle: 1,
  persona: "Elora",
  runOnFocusRegain: true,
  focusRegainDelayMs: 7500,
};

// -----------------------------
// Internal helpers
// -----------------------------

function nowIso() {
  return new Date().toISOString();
}

function minutes(ms: number) {
  return ms / 60000;
}

function msFromMinutes(mins: number) {
  return Math.max(0, Math.round(mins * 60000));
}

function readNumber(key: string, fallback = 0) {
  try {
    const v = localStorage.getItem(key);
    return v ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

function readString(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function hmrGlobal<T = unknown>(slot: string, init: () => T): T {
  const g = globalThis as any;
  g.__VIREON__ = g.__VIREON__ || {};
  if (!g.__VIREON__[slot]) {
    g.__VIREON__[slot] = init();
  }
  return g.__VIREON__[slot];
}

// -----------------------------
// LearningCore implementation
// -----------------------------

class LearningCoreClass {
  private cfg: LearningCoreConfig = { ...DEFAULTS };
  private timer: number | null = null;
  private isRunning = false;
  private stepsThisCycle = 0;
  private focusHandlerBound?: () => void;

  configure(partial: Partial<LearningCoreConfig>) {
    this.cfg = { ...this.cfg, ...partial };
    this.emit({
      kind: "skipped",
      reason: "config-updated",
      at: nowIso(),
      agent: this.cfg.persona,
    });
    // Reschedule if enabled
    if (this.cfg.enabled) this._scheduleNext();
  }

  getConfig(): LearningCoreConfig {
    return { ...this.cfg };
  }

  start() {
    if (this.cfg.enabled === false) this.cfg.enabled = true;
    this._attachFocusHandler();
    this._scheduleNext();
  }

  stop() {
    this.cfg.enabled = false;
    this._clearTimer();
    this._detachFocusHandler();
  }

  /**
   * Manually force a cycle (ignores interval gate).
   */
  async runNow(reason = "manual") {
    await this._runCycle({ manual: true, reason });
  }

  // -----------------------------
  // Internals
  // -----------------------------

  private _attachFocusHandler() {
    if (!this.cfg.runOnFocusRegain || this.focusHandlerBound) return;
    this.focusHandlerBound = () => {
      if (!this.cfg.enabled) return;
      // Delay to avoid immediate spam when tab regains focus
      const delay = this.cfg.focusRegainDelayMs ?? DEFAULTS.focusRegainDelayMs!;
      window.setTimeout(() => {
        this._runCycle({ manual: false, reason: "focus-regain" });
      }, delay);
    };
    window.addEventListener("visibilitychange", this._onVisibility);
  }

  private _detachFocusHandler() {
    window.removeEventListener("visibilitychange", this._onVisibility);
    this.focusHandlerBound = undefined;
  }

  private _onVisibility = () => {
    if (document.visibilityState === "visible" && this.focusHandlerBound) {
      this.focusHandlerBound();
    }
  };

  private _clearTimer() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private _scheduleNext() {
    this._clearTimer();
    if (!this.cfg.enabled) return;

    const lastRunIso = readString(STORAGE_KEYS.lastRun, "");
    const lastRun = lastRunIso ? Date.parse(lastRunIso) : 0;
    const now = Date.now();
    const minGapMs = msFromMinutes(this.cfg.minIntervalMinutes);
    const elapsed = now - lastRun;
    const wait = Math.max(0, minGapMs - elapsed);

    this.timer = window.setTimeout(() => {
      this._runCycle({ manual: false, reason: "scheduled" });
    }, wait);

    this.emit({
      kind: "scheduled-start",
      at: nowIso(),
      agent: this.cfg.persona,
      nextAttemptInMs: wait,
      reason: "scheduled",
    });
  }

  private _intervalGateOk() {
    const lastRunIso = readString(STORAGE_KEYS.lastRun, "");
    if (!lastRunIso) return true;
    const lastRun = Date.parse(lastRunIso);
    const gapMs = Date.now() - lastRun;
    return minutes(gapMs) >= this.cfg.minIntervalMinutes;
  }

  private emit(evt: CycleEvent) {
    this.cfg.onCycle?.(evt);
  }

  private async _runCycle(opts: { manual: boolean; reason: string }) {
    if (!this.cfg.enabled) return;

    // Interval guard for autonomous runs
    if (!opts.manual && !this._intervalGateOk()) {
      this.emit({
        kind: "skipped",
        at: nowIso(),
        agent: this.cfg.persona,
        reason: "interval-gate",
      });
      this._scheduleNext(); // still ensure next attempt is scheduled
      return;
    }

    if (this.isRunning) {
      this.emit({
        kind: "skipped",
        at: nowIso(),
        agent: this.cfg.persona,
        reason: "already-running",
      });
      return;
    }

    try {
      this.isRunning = true;
      this.stepsThisCycle = 0;

      // Safety guard for accidental recursion
      if (this.stepsThisCycle >= this.cfg.maxStepsPerCycle) {
        this.emit({
          kind: "skipped",
          at: nowIso(),
          agent: this.cfg.persona,
          reason: "step-budget-exhausted",
        });
        return;
      }

      const agent = this.cfg.persona;
      logEvent(agent, "system", "🌊 LearningCore: initiating Wellspring", {
        reason: opts.reason,
        cfg: { ...this.cfg, onCycle: undefined },
      });

      const res = await initiateWellspring(agent);

      write(STORAGE_KEYS.lastRun, nowIso());
      write(STORAGE_KEYS.lastReason, opts.reason);
      write(STORAGE_KEYS.runCount, String(readNumber(STORAGE_KEYS.runCount, 0) + 1));

      if (res?.ok) {
        this.emit({
          kind: "success",
          at: nowIso(),
          agent,
          reason: opts.reason,
          nextAttemptInMs: msFromMinutes(this.cfg.minIntervalMinutes),
        });
        logEvent(agent, "system", "✅ LearningCore: Wellspring completed.", res?.data);
      } else {
        this.emit({
          kind: "error",
          at: nowIso(),
          agent,
          reason: res?.message || "unknown",
          nextAttemptInMs: msFromMinutes(this.cfg.minIntervalMinutes),
          error: String(res?.data?.error ?? res?.message ?? "unknown"),
        });
        logEvent(agent, "error", "❌ LearningCore: Wellspring failed.", res);
      }
    } catch (err: any) {
      this.emit({
        kind: "error",
        at: nowIso(),
        agent: this.cfg.persona,
        reason: "exception",
        nextAttemptInMs: msFromMinutes(this.cfg.minIntervalMinutes),
        error: String(err?.message || err),
      });
      logEvent(this.cfg.persona, "error", "❌ LearningCore: exception during cycle.", {
        error: String(err?.message || err),
      });
    } finally {
      this.isRunning = false;
      this.stepsThisCycle = 0;
      // Always schedule the next attempt after any run path
      this._scheduleNext();
    }
  }
}

// -----------------------------
// Singleton (HMR safe)
// -----------------------------

const LearningCoreSingleton = hmrGlobal<LearningCoreClass>(
  "LEARNING_CORE_SINGLETON",
  () => new LearningCoreClass()
);

// Public API (friendly, minimal)
export function configureLearningCore(partial: Partial<LearningCoreConfig>) {
  LearningCoreSingleton.configure(partial);
}

export function startLearningCore(config?: Partial<LearningCoreConfig>) {
  if (config) LearningCoreSingleton.configure(config);
  LearningCoreSingleton.start();
}

export function stopLearningCore() {
  LearningCoreSingleton.stop();
}

export function triggerLearningNow(reason = "manual") {
  return LearningCoreSingleton.runNow(reason);
}

export function getLearningConfig(): LearningCoreConfig {
  return LearningCoreSingleton.getConfig();
}
