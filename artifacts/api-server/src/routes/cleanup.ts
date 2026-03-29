import { Router, type IRouter } from "express";
import {
  getCleanupCandidates,
  executeCleanup,
  recordSpamFeedback,
} from "../services/spamHeuristic.js";

const router: IRouter = Router();

router.get("/cleanup/candidates", async (req, res) => {
  try {
    const result = await getCleanupCandidates(300);
    res.json(result);
  } catch (err) {
    req.log?.error({ err }, "Failed to get cleanup candidates");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/cleanup/execute", async (req, res) => {
  try {
    const { emailIds, action } = req.body as {
      emailIds?: string[];
      action?: "delete" | "archive" | "mark_spam";
    };

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      res.status(400).json({ error: "emailIds array required" });
      return;
    }

    const validActions = ["delete", "archive", "mark_spam"] as const;
    if (!action || !validActions.includes(action)) {
      res.status(400).json({ error: "action must be delete | archive | mark_spam" });
      return;
    }

    const result = await executeCleanup(emailIds, action);
    res.json({ success: true, processed: result.processed });
  } catch (err) {
    req.log?.error({ err }, "Failed to execute cleanup");
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/spam/feedback", async (req, res) => {
  try {
    const { emailId, feedback } = req.body as {
      emailId?: string;
      feedback?: "not_spam" | "is_spam";
    };

    if (!emailId || !feedback) {
      res.status(400).json({ error: "emailId and feedback required" });
      return;
    }

    await recordSpamFeedback(emailId, feedback);
    res.json({ success: true });
  } catch (err) {
    req.log?.error({ err }, "Failed to record spam feedback");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
