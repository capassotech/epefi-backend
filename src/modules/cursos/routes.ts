// src/modules/cursos/routes.ts
import { Router } from "express";
import {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
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

// Rutas públicas
router.get("/", getAllCourses);
router.get("/:id", getCourseById);

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

router.delete("/:id", authMiddleware, deleteCourseHandler);

export default router;
