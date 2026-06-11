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
  const [delegatedTasks, setDelegatedTasks] = useState([]);
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
        const taskParams = new URLSearchParams();
        if (sessionId) taskParams.set("sessionId", sessionId);
        else taskParams.set("includeAllSessions", "true");
        const [response, taskResponse] = await Promise.all([
          fetch(`${runtimeBaseUrl}/api/executions?${query}`),
          fetch(`${runtimeBaseUrl}/api/tasks?${taskParams.toString()}`),
        ]);
        if (!response.ok)
          throw new Error(`runtime returned ${response.status}`);
        if (!taskResponse.ok)
          throw new Error(`task runtime returned ${taskResponse.status}`);
        const [payload, taskPayload] = await Promise.all([
          response.json(),
          taskResponse.json(),
        ]);
        if (!mounted) return;
        setExecutions(payload.executions || []);
        setDelegatedTasks(taskPayload.tasks || []);
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
  }, [query, refreshNonce, sessionId]);

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
        including approval, risk, linked IDs, task receipts, and receipt summaries.
      </p>

      {error && (
        <div className="execution-panel-error">
          Execution feed unavailable: {error}
        </div>
      )}

      <div className="execution-record-list">
        {delegatedTasks.map((task) => (
          <article
            className="execution-record-card delegated-task-card"
            key={`${task.id}-${task.updatedAt}`}
          >
            <div className="execution-record-topline">
              <strong>{task.objective}</strong>
              <span className={`execution-risk task-status-${task.status}`}>
                {task.status}
              </span>
            </div>

            <div className="execution-record-meta">
              <span>{task.parentAgent} → {task.assignedAgent}</span>
              <span>events: {task.auditTrail?.length || 0}</span>
              <span>tools: {task.requiredTools?.join(", ") || "none"}</span>
            </div>

            <p className="execution-receipt-summary">
              {task.receipt?.summary || task.result?.summary || "Task receipt pending"}
            </p>

            <dl className="execution-detail-grid">
              <div>
                <dt>Session</dt>
                <dd>{task.sessionId || "—"}</dd>
              </div>
              <div>
                <dt>Approvals</dt>
                <dd>
                  {task.approvalRequirements?.length
                    ? task.approvalRequirements
                        .map((item) => item.status || "pending")
                        .join(", ")
                    : "not required"}
                </dd>
              </div>
              <div>
                <dt>Receipt</dt>
                <dd>{task.receipt?.id || "—"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(task.updatedAt || task.createdAt)}</dd>
              </div>
            </dl>

            {task.constraints?.length > 0 && (
              <p className="execution-provider-summary">
                Constraints: {task.constraints.join("; ")}
              </p>
            )}
          </article>
        ))}

        {executions.length === 0 && delegatedTasks.length === 0 && !error ? (
          <div className="execution-empty-state">
            No execution records or delegated tasks have been issued yet.
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
