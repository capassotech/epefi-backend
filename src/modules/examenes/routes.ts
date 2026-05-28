import { Router } from "express";
import { createExamen, getAllExamenes } from "./controller";
import {
  validateBody,
  basicSanitization,
} from "../../middleware/zodValidation";
import { ExamenSchema } from "../../types/schemas";

const router = Router();

router.get("/", getAllExamenes);
router.post("/", basicSanitization, validateBody(ExamenSchema), createExamen);

export default router;
