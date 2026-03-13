// src/modules/materia/routes.ts
import { Router } from "express";
import {
  getAllMaterias,
  getMateriaById,
  createMateria,
  updateMateria,
  deleteMateria,
  toggleMateriaStatus,
  toggleModuleForAllStudents,
  getModulosHabilitadosEstado,
  getModuloExcepciones,
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

const toggleMateriaStatusHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return toggleMateriaStatus(req as AuthenticatedRequest, res);
};

const toggleModuleForAllStudentsHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return toggleModuleForAllStudents(req as AuthenticatedRequest, res);
};

const getModulosHabilitadosEstadoHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return getModulosHabilitadosEstado(req as AuthenticatedRequest, res);
};

const getModuloExcepcionesHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return getModuloExcepciones(req as AuthenticatedRequest, res);
};

// Rutas públicas
router.get("/", getAllMaterias);

// Rutas específicas deben ir ANTES de /:id
router.get("/:id/modulos-habilitados-estado", authMiddleware, validateParams(IdParamSchema), getModulosHabilitadosEstadoHandler);

router.get("/:id", getMateriaById);

// Rutas protegidas
router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(MateriaSchema),
  createMateriaHandler
);

// IMPORTANTE: Las rutas más específicas deben ir ANTES de las genéricas
// Ruta para habilitar/deshabilitar módulos de manera grupal (debe ir antes de /:id)
router.patch(
  "/:id/modulos/toggle",
  authMiddleware,
  validateParams(IdParamSchema),
  validateBody(z.object({
    moduleId: z.string().min(1),
    enabled: z.boolean(),
  })),
  toggleModuleForAllStudentsHandler
);

// Ruta para alternar estado (debe ir antes de /:id para evitar conflictos)
router.patch("/:id/toggle-status", authMiddleware, toggleMateriaStatusHandler);

router.get(
  "/:id/modulos-excepciones",
  authMiddleware,
  validateParams(IdParamSchema),
  getModuloExcepcionesHandler
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
