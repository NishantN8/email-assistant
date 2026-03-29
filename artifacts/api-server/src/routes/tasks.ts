import { Router, type IRouter } from "express";
import {
  getTasksWithEmails,
  updateTaskStatus,
  getTaskForEmail,
  type TaskStatus,
} from "../services/taskEngine.js";

const router: IRouter = Router();

router.get("/tasks", async (req, res) => {
  try {
    const status = req.query["status"] as TaskStatus | undefined;
    const validStatuses: TaskStatus[] = ["needs_action", "in_progress", "done"];
    const filteredStatus =
      status && validStatuses.includes(status) ? status : undefined;

    const tasks = await getTasksWithEmails(filteredStatus);
    res.json({ tasks, total: tasks.length });
  } catch (err) {
    req.log?.error({ err }, "Failed to get tasks");
    res.status(500).json({ error: "internal_error", message: "Failed to get tasks" });
  }
});

router.get("/tasks/email/:emailId", async (req, res) => {
  try {
    const { emailId } = req.params;
    const task = await getTaskForEmail(emailId);
    if (!task) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(task);
  } catch (err) {
    req.log?.error({ err }, "Failed to get task for email");
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: TaskStatus };
    const validStatuses: TaskStatus[] = ["needs_action", "in_progress", "done"];

    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({ error: "invalid_status", valid: validStatuses });
      return;
    }

    const updated = await updateTaskStatus(id, status);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ success: true, taskId: id, status });
  } catch (err) {
    req.log?.error({ err }, "Failed to update task");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
