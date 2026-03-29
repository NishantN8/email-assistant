import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailsRouter from "./emails";
import decisionsRouter from "./decisions";
import actionsRouter from "./actions";
import syncRouter from "./sync";
import authRouter from "./auth";
import aiStatusRouter from "./ai-status";
import repliesRouter from "./replies";
import settingsRouter from "./settings";
import tasksRouter from "./tasks";
import outcomeSignalsRouter from "./outcome-signals";
import cleanupRouter from "./cleanup";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(emailsRouter);
router.use(decisionsRouter);
router.use(actionsRouter);
router.use(syncRouter);
router.use(aiStatusRouter);
router.use(repliesRouter);
router.use(settingsRouter);
router.use(tasksRouter);
router.use(cleanupRouter);

if (process.env["ENABLE_OUTCOME_ENGINE"] === "true") {
  router.use(outcomeSignalsRouter);
}

export default router;
