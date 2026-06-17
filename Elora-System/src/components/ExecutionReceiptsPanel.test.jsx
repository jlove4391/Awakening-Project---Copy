import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ExecutionReceiptsPanel from "./ExecutionReceiptsPanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flushPromises = () => new Promise((resolve) => {
  setTimeout(resolve, 0);
});

function jsonResponse(payload) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
}

describe("ExecutionReceiptsPanel approval smoke", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
      root = undefined;
    }
    document.body.removeChild(container);
    jest.restoreAllMocks();
  });

  it("renders pending task approval and posts approval to the task endpoint", async () => {
    const pendingTask = {
      id: "task-approval-smoke",
      objective: "Smoke task awaiting approval",
      status: "pending_approval",
      parentAgent: "Elora",
      assignedAgent: "Nexora",
      requiredTools: ["code.create_file"],
      auditTrail: [],
      approvalRequirements: [{ required: true, status: "pending", reason: "smoke" }],
      updatedAt: "2026-06-17T00:00:00.000Z",
    };
    const queuedTask = {
      ...pendingTask,
      status: "queued",
      approvalRequirements: [
        {
          required: true,
          status: "approved",
          reason: "smoke",
          approver: "user",
          approvedAt: "2026-06-17T00:01:00.000Z",
        },
      ],
    };

    const fetchMock = jest.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
      if (String(url).includes("/api/tasks/task-approval-smoke/approve")) {
        return jsonResponse({ task: queuedTask });
      }
      if (String(url).includes("/api/executions")) {
        return jsonResponse({ executions: [] });
      }
      if (String(url).includes("/api/tasks")) {
        return jsonResponse({ tasks: [pendingTask] });
      }
      throw new Error(`Unexpected smoke fetch: ${url}`);
    });

    await act(async () => {
      root = createRoot(container);
      root.render(<ExecutionReceiptsPanel sessionId="approval-smoke-session" />);
      await flushPromises();
    });

    const approveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Approve task",
    );
    expect(approveButton).toBeTruthy();
    expect(container.textContent).toContain("Task approval is pending before Nexora can start.");

    await act(async () => {
      approveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushPromises();
    });

    const approvalCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/tasks/task-approval-smoke/approve"),
    );
    expect(approvalCall).toBeTruthy();
    expect(approvalCall[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(approvalCall[1].body)).toMatchObject({
      confirmedByUser: true,
      approver: "user",
      note: "Approved from execution receipts panel.",
    });
  });
});
