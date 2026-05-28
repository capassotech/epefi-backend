import { Router, Request, Response, NextFunction } from "express";
import {
  createExamen,
  getAllExamenes,
  getExamenById,
  updateExamen,
  deleteExamen,
} from "./controller";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import {
  validateBody,
  validateParams,
  basicSanitization,
} from "../../middleware/zodValidation";
import { ExamenSchema } from "../../types/schemas";
import { z } from "zod";

const router = Router();
const IdParamSchema = z.object({
  id: z.string().min(1, "El ID del examen es obligatorio"),
});

const getAllExamenesHandler = (req: Request, res: Response) =>
  getAllExamenes(req as AuthenticatedRequest, res);

const getExamenByIdHandler = (req: Request, res: Response) =>
  getExamenById(req as AuthenticatedRequest, res);

const createExamenHandler = (req: Request, res: Response) =>
  createExamen(req as AuthenticatedRequest, res);

const updateExamenHandler = (req: Request, res: Response) =>
  updateExamen(req as AuthenticatedRequest, res);

const deleteExamenHandler = (req: Request, res: Response) =>
  deleteExamen(req as AuthenticatedRequest, res);

router.get("/", authMiddleware, getAllExamenesHandler);
router.get("/:id", authMiddleware, validateParams(IdParamSchema), getExamenByIdHandler);

router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(ExamenSchema),
  createExamenHandler
);

router.put(
  "/:id",
  authMiddleware,
  validateParams(IdParamSchema),
  basicSanitization,
  validateBody(ExamenSchema),
  updateExamenHandler
);

router.delete(
  "/:id",
  authMiddleware,
  validateParams(IdParamSchema),
  deleteExamenHandler
);

export default router;
