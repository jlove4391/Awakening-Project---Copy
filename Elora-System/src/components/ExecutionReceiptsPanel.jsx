import React, { useEffect, useMemo, useState } from "react";

const runtimeBaseUrl =
  process.env.REACT_APP_AGENT_RUNTIME_URL || "http://localhost:4317";

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch (_error) {
    return value;
  }
};

const riskClass = (riskLevel) =>
  `execution-risk execution-risk-${String(riskLevel || "unknown").replace(/_/g, "-")}`;

const ExecutionReceiptsPanel = ({
  sessionId,
  limit = 12,
  refreshNonce = 0,
}) => {
  const [executions, setExecutions] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sessionId) params.set("sessionId", sessionId);
    return params.toString();
  }, [limit, sessionId]);

  useEffect(() => {
    let mounted = true;
    const loadExecutions = async () => {
      try {
        setStatus("loading");
        const response = await fetch(
          `${runtimeBaseUrl}/api/executions?${query}`,
        );
        if (!response.ok)
          throw new Error(`runtime returned ${response.status}`);
        const payload = await response.json();
        if (!mounted) return;
        setExecutions(payload.executions || []);
        setStatus("ready");
        setError("");
      } catch (loadError) {
        if (!mounted) return;
        setStatus("error");
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load execution receipts",
        );
      }
    };

    loadExecutions();
    const interval = window.setInterval(loadExecutions, 7000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [query, refreshNonce]);

  return (
    <section
      className="execution-receipts-panel"
      aria-labelledby="execution-receipts-title"
    >
      <div className="execution-receipts-header">
        <div>
          <p className="core-card-label">Runtime Source of Truth</p>
          <h2 id="execution-receipts-title" className="core-card-title">
            Executions & Receipts
          </h2>
        </div>
        <span className={`status-pill execution-status-${status}`}>
          {status}
        </span>
      </div>

      <p className="core-card-copy">
        Recent tool calls and delegated tasks persisted by the backend runtime,
        including approval, risk, linked IDs, and receipt summaries.
      </p>

      {error && (
        <div className="execution-panel-error">
          Execution feed unavailable: {error}
        </div>
      )}

      <div className="execution-record-list">
        {executions.length === 0 && !error ? (
          <div className="execution-empty-state">
            No execution records have been issued yet.
          </div>
        ) : (
          executions.map((execution) => (
            <article
              className="execution-record-card"
              key={`${execution.id}-${execution.timestamps?.completedAt || execution.timestamps?.requestedAt}`}
            >
              <div className="execution-record-topline">
                <strong>{execution.action}</strong>
                <span className={riskClass(execution.riskLevel)}>
                  {execution.riskLevel}
                </span>
              </div>

              <div className="execution-record-meta">
                <span>{execution.kind}</span>
                <span>status: {execution.status}</span>
                <span>approval: {execution.approvalStatus}</span>
              </div>

              <p className="execution-receipt-summary">
                {execution.receipt?.summary ||
                  execution.providerResponseSummary ||
                  "Receipt pending"}
              </p>

              <dl className="execution-detail-grid">
                <div>
                  <dt>Requested by</dt>
                  <dd>{execution.whoRequested || "unknown"}</dd>
                </div>
                <div>
                  <dt>Chosen by</dt>
                  <dd>{execution.chosenByAgent || "unknown"}</dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>{execution.linkedIds?.sessionId || "—"}</dd>
                </div>
                <div>
                  <dt>Completed</dt>
                  <dd>
                    {formatDateTime(
                      execution.timestamps?.completedAt ||
                        execution.timestamps?.requestedAt,
                    )}
                  </dd>
                </div>
              </dl>

              {execution.providerResponseSummary && (
                <p className="execution-provider-summary">
                  Provider: {execution.providerResponseSummary}
                </p>
              )}

              {execution.errors?.length > 0 && (
                <p className="execution-error-summary">
                  Errors: {execution.errors.join("; ")}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default ExecutionReceiptsPanel;
