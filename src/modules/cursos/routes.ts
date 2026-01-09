// src/modules/cursos/routes.ts
import { Router } from "express";
import {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getCoursesByUserId,
  toggleCourseStatus
} from "./controller";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import {
  validateBody,
  validateMultiple,
  basicSanitization,
} from "../../middleware/zodValidation";
import { CourseSchema, UpdateCourseSchema } from "../../types/schemas";
import { Request, Response, NextFunction } from "express";

const router = Router();

// Middleware de logging para debug
router.use((req, res, next) => {
  console.log(`[CURSOS] ${req.method} ${req.path}`);
  next();
});

// Rutas públicas
// IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros genéricos
router.get("/", getAllCourses);

// Rutas protegidas - requieren autenticación
router.get("/user/:id", authMiddleware, (req: Request, res: Response) => {
  return getCoursesByUserId(req as AuthenticatedRequest, res);
});

router.get("/:id", authMiddleware, (req: Request, res: Response) => {
  return getCourseById(req as AuthenticatedRequest, res);
});

// Wrapper para manejar AuthenticatedRequest correctamente
const createCourseHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return createCourse(req as AuthenticatedRequest, res);
};


const updateCourseHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return updateCourse(req as AuthenticatedRequest, res);
};

const deleteCourseHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return deleteCourse(req as AuthenticatedRequest, res);
};

const toggleCourseStatusHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  return toggleCourseStatus(req as AuthenticatedRequest, res);
};

// Rutas protegidas
router.post(
  "/",
  authMiddleware,
  basicSanitization,
  validateBody(CourseSchema),
  createCourseHandler
);

router.put(
  "/:id",
  authMiddleware,
  basicSanitization,
  validateMultiple({
    body: UpdateCourseSchema,
  }),
  updateCourseHandler
);

// Ruta para alternar estado (debe ir antes de /:id para evitar conflictos)
router.patch("/:id/toggle-status", authMiddleware, toggleCourseStatusHandler);

router.delete("/:id", authMiddleware, deleteCourseHandler);

export default router;
