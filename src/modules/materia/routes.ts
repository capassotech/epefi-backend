// src/modules/materia/routes.ts
import { Router } from "express";
import {
  getAllMaterias,
  getMateriaById,
  createMateria,
  updateMateria,
  deleteMateria,
} from "./controller";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import {
  validateBody,
  validateMultiple,
  validateParams,
  basicSanitization,
} from "../../middleware/zodValidation";
import { MateriaSchema, UpdateMateriaSchema } from "../../types/schemas";
import { z } from "zod";
import { Request, Response, NextFunction } from "express";

const router = Router();
const IdParamSchema = z.object({ id: z.string().min(1) });

// Wrappers para manejar AuthenticatedRequest
const createMateriaHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return createMateria(req as AuthenticatedRequest, res);
};

const updateMateriaHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return updateMateria(req as AuthenticatedRequest, res);
};

const deleteMateriaHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return deleteMateria(req as AuthenticatedRequest, res);
};

// Rutas públicas
router.get("/", getAllMaterias);

router.get("/:id", getMateriaById);

// Rutas protegidas
router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(MateriaSchema),
  createMateriaHandler
);

router.put(
  "/:id",
  authMiddleware,
  validateParams(IdParamSchema), 
  basicSanitization,
  validateBody(UpdateMateriaSchema),
  updateMateriaHandler
);

router.delete(
  "/:id",
  authMiddleware, 
  deleteMateriaHandler
);

export default router;
