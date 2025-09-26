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
  validateId,
  basicSanitization,
} from "../../middleware/zodValidation";
import { MateriaSchema, UpdateMateriaSchema } from "../../types/courses";
import { Request, Response, NextFunction } from "express";

const router = Router();

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
router.get("/:id", validateId, getMateriaById);

// Rutas protegidas
router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(MateriaSchema),
  createMateriaHandler
);

router.put("/:id", authMiddleware, basicSanitization, validateBody(MateriaSchema), updateMateriaHandler);

router.delete("/:id", deleteMateriaHandler);

export default router;
