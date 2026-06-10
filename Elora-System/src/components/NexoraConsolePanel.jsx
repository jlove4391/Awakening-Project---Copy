import React, { useState, useEffect } from "react";
import { VsCodeActions } from "../nexora/actions/vscode";

export default function NexoraConsolePanel() {
  const [cwd, setCwd] = useState(".");
  const [cmd, setCmd] = useState("node");
  const [args, setArgs] = useState("-v");
  const [path, setPath] = useState("scratch/hello.txt");
  const [data, setData] = useState("hello");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  const append = (t) => setLog((s) => (s ? s + "\n" : "") + t);

  useEffect(() => {
    (async () => {
      try {
        const s = await VsCodeActions.check();
        append(`status: ${JSON.stringify(s)}`);
      } catch (e) {
        append(`status error: ${String(e)}`);
      }
    })();
  }, []);

  const onRun = async () => {
    try {
      setBusy(true);
      append(`$ ${cmd} ${args}`);
      const a = args.trim() ? args.split(/\s+/) : [];
      await VsCodeActions.runCmd(cmd, a, {
        cwd,
        onLog: (line) => append(line),
      });
    } catch (e) {
      append(`run error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onWrite = async () => {
    try {
      setBusy(true);
      const r = await VsCodeActions.writeFile(path, data);
      append(`write ${path}: ${JSON.stringify(r)}`);
    } catch (e) {
      append(`write error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onList = async () => {
    try {
      setBusy(true);
      const r = await VsCodeActions.listDir(cwd);
      append(`list ${cwd}: ${JSON.stringify(r)}`);
    } catch (e) {
      append(`list error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1px solid #444", borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "90px 1fr" }}>
        <label>CWD</label>
        <input value={cwd} onChange={(e) => setCwd(e.target.value)} />

        <label>cmd</label>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} />

        <label>args</label>
        <input value={args} onChange={(e) => setArgs(e.target.value)} />

        <label>path</label>
        <input value={path} onChange={(e) => setPath(e.target.value)} />

        <label>data</label>
        <textarea rows={4} value={data} onChange={(e) => setData(e.target.value)} />
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onRun} disabled={busy}>Run</button>
        <button onClick={onWrite} disabled={busy}>Write file</button>
        <button onClick={onList} disabled={busy}>List dir</button>
      </div>

      <pre
        style={{
          marginTop: 12,
          minHeight: 220,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid #333",
          padding: 10,
          overflow: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {log || "Ready"}
      </pre>
    </div>
  );
}
