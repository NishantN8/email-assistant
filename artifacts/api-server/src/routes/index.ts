import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailsRouter from "./emails";
import decisionsRouter from "./decisions";
import actionsRouter from "./actions";
import syncRouter from "./sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emailsRouter);
router.use(decisionsRouter);
router.use(actionsRouter);
router.use(syncRouter);

export default router;
