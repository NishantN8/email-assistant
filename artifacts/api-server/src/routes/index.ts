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

export default router;
