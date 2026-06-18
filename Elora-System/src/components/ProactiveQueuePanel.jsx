import React, { useEffect, useState } from "react";

const runtimeBaseUrl = process.env.REACT_APP_AGENT_RUNTIME_URL || "http://localhost:4317";

const actionLabels = { approve: "Approve", defer: "Defer", dismiss: "Dismiss" };

export default function ProactiveQueuePanel() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState("");

  const loadItems = async () => {
    const response = await fetch(`${runtimeBaseUrl}/api/proactive-queue`);
    if (!response.ok) throw new Error(`Queue load failed (${response.status})`);
    const payload = await response.json();
    setItems(payload.items || []);
  };

  useEffect(() => { loadItems().catch((err) => setError(err.message)); }, []);

  const act = async (item, action) => {
    setBusy((current) => ({ ...current, [item.id]: action }));
    setError("");
    try {
      const response = await fetch(`${runtimeBaseUrl}/api/proactive-queue/${item.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedByUser: action === "approve", approver: "ui", note: `${actionLabels[action]} from Elora review queue.` }),
      });
      if (!response.ok) throw new Error(`${actionLabels[action]} failed (${response.status})`);
      await loadItems();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy((current) => { const next = { ...current }; delete next[item.id]; return next; });
    }
  };

  return (
    <section className="proactive-queue" aria-labelledby="proactive-queue-title">
      <div className="approval-workflow-header">
        <div>
          <p className="approval-eyebrow">ELORA / CORE Recommendations</p>
          <h2 id="proactive-queue-title">Proactive improvement queue</h2>
        </div>
        <span>{items.length} ranked</span>
      </div>
      {error && <p className="queue-error">{error}</p>}
      <div className="approval-card-list">
        {items.length ? items.map((item) => (
          <article className="approval-card" key={item.id}>
            <div className="approval-card-topline">
              <strong>{item.title}</strong>
              <span className={`approval-risk approval-risk-${item.risk}`}>{item.risk}</span>
            </div>
            <p>{item.summary}</p>
            <dl className="approval-detail-grid">
              <div><dt>Status</dt><dd>{item.status}</dd></div>
              <div><dt>Affected area</dt><dd>{item.affectedArea}</dd></div>
              <div><dt>Source</dt><dd>{item.source}</dd></div>
              <div><dt>Effort</dt><dd>{item.estimatedEffort}</dd></div>
              <div><dt>Rank</dt><dd>{item.rank} (impact {item.impact}, confidence {item.confidence})</dd></div>
              <div><dt>Receipts</dt><dd>{item.receipts?.length || 0} · duplicates merged {item.duplicateCount}</dd></div>
            </dl>
            {item.status === "open" && (
              <div className="approval-actions">
                {(["approve", "defer", "dismiss"]).map((action) => (
                  <button key={action} type="button" onClick={() => act(item, action)} disabled={Boolean(busy[item.id])} className={action === "dismiss" ? "approval-deny-button" : undefined}>
                    {busy[item.id] === action ? `${actionLabels[action]}…` : actionLabels[action]}
                  </button>
                ))}
              </div>
            )}
          </article>
        )) : <p>No proactive recommendations queued.</p>}
      </div>
    </section>
  );
}
