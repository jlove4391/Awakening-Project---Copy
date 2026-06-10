// src/nexora/autonomy.ts
import { planTask, implementTask, getDiff, runTests } from "../system/nexoraClient";

export type AutonomyEvents = {
  onLog?: (line: string) => void;
  onDone?: (summary: string) => void;
  onError?: (err: string) => void;
};

export async function startNexAutonomy(goal: string, ev: AutonomyEvents = {}) {
  const say = (m: string) => ev.onLog?.(m);

  try {
    say(`🧭 Goal received: ${goal}`);

    // 1) PLAN
    say(`📐 Planning…`);
    const planRes = await planTask({ goal });           // uses your bridge actions
    const plan = planRes?.plan || JSON.stringify(planRes, null, 2);
    say(`✅ Plan ready:\n${plan}`);

    // 2) IMPLEMENT (sandbox first)
    say(`🛠️ Implementing in sandbox…`);
    await implementTask({ plan, commit: false });

    // 3) DIFF (show what will change)
    say(`📄 Diff:`);
    const diffRes = await getDiff();
    const diffs = diffRes?.diffs || diffRes?.files || [];
    if (Array.isArray(diffs) && diffs.length) {
      diffs.slice(0, 10).forEach((d: any) => {
        const path = d.path || d.file || "unknown";
        say(`• ${path}`);
      });
    } else {
      say(`(no diff payload returned)`);
    }

    // 4) TESTS
    say(`🧪 Running tests…`);
    const testRes = await runTests();
    const ok = !!testRes?.passed;
    say(testRes?.output ? testRes.output : ok ? "Tests passed." : "Tests failed.");

    // 5) (Optional) Commit automatically if tests passed
    if (ok) {
      say(`🔐 Committing changes…`);
      await implementTask({ plan, commit: true }); // same endpoint, commit=true path
      say(`✅ Commit completed.`);
    } else {
      say(`⚠️ Not committing because tests failed.`);
    }

    ev.onDone?.(`Autonomy cycle complete. Tests ${ok ? "passed" : "failed"}.`);
  } catch (err: any) {
    const msg = String(err?.message || err);
    ev.onError?.(msg);
  }
}
