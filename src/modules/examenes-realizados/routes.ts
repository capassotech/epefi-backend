import { Router, Request, Response } from "express";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import { validateBody, validateParams } from "../../middleware/zodValidation";
import { SubmitExamenSchema } from "../../types/schemas";
import { z } from "zod";
import {
  getMisIntentosExamen,
  submitExamenRealizado,
} from "./controller";
import {
  exportExamenesRealizadosAdmin,
  getExamenRealizadoDetalleAdmin,
  getExamenesRealizadosAdmin,
} from "./adminController";

const router = Router();
const IdParamSchema = z.object({
  id: z.string().min(1, "El ID es obligatorio"),
});

const submitHandler = (req: Request, res: Response) =>
  submitExamenRealizado(req as AuthenticatedRequest, res);

const intentosHandler = (req: Request, res: Response) =>
  getMisIntentosExamen(req as AuthenticatedRequest, res);

const listAdminHandler = (req: Request, res: Response) =>
  getExamenesRealizadosAdmin(req as AuthenticatedRequest, res);

const detalleAdminHandler = (req: Request, res: Response) =>
  getExamenRealizadoDetalleAdmin(req as AuthenticatedRequest, res);

const exportAdminHandler = (req: Request, res: Response) =>
  exportExamenesRealizadosAdmin(req as AuthenticatedRequest, res);

// ========== ADMIN (rutas específicas antes de /:id) ==========
router.get("/export", authMiddleware, exportAdminHandler);

router.get(
  "/detalle/:id",
  authMiddleware,
  validateParams(IdParamSchema),
  detalleAdminHandler
);

router.get(
  "/alumno/examen/:idExamen/intentos",
  authMiddleware,
  intentosHandler
);

router.get("/", authMiddleware, listAdminHandler);

router.post("/", authMiddleware, validateBody(SubmitExamenSchema), submitHandler);

router.get(
  "/:id",
  authMiddleware,
  validateParams(IdParamSchema),
  detalleAdminHandler
);

export default router;
