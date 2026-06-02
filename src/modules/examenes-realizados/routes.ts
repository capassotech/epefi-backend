import { Router, Request, Response } from "express";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import { validateBody } from "../../middleware/zodValidation";
import { SubmitExamenSchema } from "../../types/schemas";
import {
  getMisIntentosExamen,
  submitExamenRealizado,
} from "./controller";

const router = Router();

const submitHandler = (req: Request, res: Response) =>
  submitExamenRealizado(req as AuthenticatedRequest, res);

const intentosHandler = (req: Request, res: Response) =>
  getMisIntentosExamen(req as AuthenticatedRequest, res);

router.post("/", authMiddleware, validateBody(SubmitExamenSchema), submitHandler);

router.get(
  "/alumno/examen/:idExamen/intentos",
  authMiddleware,
  intentosHandler
);

export default router;
