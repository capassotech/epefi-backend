import { Router, Request, Response, NextFunction } from "express";
import {
  createExamen,
  getAllExamenes,
  getExamenById,
  updateExamen,
  deleteExamen,
  setExamenHabilitado,
} from "./controller";
import {
  getExamenEstadoFormacion,
  getExamenParaAlumno,
} from "./studentController";
import {
  getAlumnosIntentosExamenAdmin,
  resetIntentosExamenAlumnoAdmin,
  upsertIntentosExamenAlumnoAdmin,
} from "./intentosAdminController";
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

const IntentosAlumnoParamSchema = z.object({
  id: z.string().min(1, "El ID del examen es obligatorio"),
  idAlumno: z.string().min(1, "El ID del alumno es obligatorio"),
});

const UpsertIntentosBodySchema = z.object({
  intentosMaximos: z
    .number({ message: "Los intentos máximos deben ser un número" })
    .int("Los intentos máximos deben ser un entero")
    .min(1, "El mínimo es 1 intento"),
});

const SetHabilitadoBodySchema = z.object({
  habilitado: z.boolean({ message: 'El campo "habilitado" debe ser un booleano' }),
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

const getExamenEstadoFormacionHandler = (req: Request, res: Response) =>
  getExamenEstadoFormacion(req as AuthenticatedRequest, res);

const getExamenParaAlumnoHandler = (req: Request, res: Response) =>
  getExamenParaAlumno(req as AuthenticatedRequest, res);

const getAlumnosIntentosHandler = (req: Request, res: Response) =>
  getAlumnosIntentosExamenAdmin(req as AuthenticatedRequest, res);

const upsertIntentosHandler = (req: Request, res: Response) =>
  upsertIntentosExamenAlumnoAdmin(req as AuthenticatedRequest, res);

const resetIntentosHandler = (req: Request, res: Response) =>
  resetIntentosExamenAlumnoAdmin(req as AuthenticatedRequest, res);

const setHabilitadoHandler = (req: Request, res: Response) =>
  setExamenHabilitado(req as AuthenticatedRequest, res);

// Rutas alumno (antes de /:id admin)
router.get(
  "/alumno/formacion/:idFormacion/estado",
  authMiddleware,
  getExamenEstadoFormacionHandler
);

router.get(
  "/alumno/:idExamen",
  authMiddleware,
  getExamenParaAlumnoHandler
);

// Admin: intentos personalizados por alumno
router.get(
  "/:id/intentos-alumnos",
  authMiddleware,
  validateParams(IdParamSchema),
  getAlumnosIntentosHandler
);

router.put(
  "/:id/intentos-alumnos/:idAlumno",
  authMiddleware,
  validateParams(IntentosAlumnoParamSchema),
  basicSanitization,
  validateBody(UpsertIntentosBodySchema),
  upsertIntentosHandler
);

router.delete(
  "/:id/intentos-alumnos/:idAlumno",
  authMiddleware,
  validateParams(IntentosAlumnoParamSchema),
  resetIntentosHandler
);

router.patch(
  "/:id/habilitado",
  authMiddleware,
  validateParams(IdParamSchema),
  basicSanitization,
  validateBody(SetHabilitadoBodySchema),
  setHabilitadoHandler
);

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
