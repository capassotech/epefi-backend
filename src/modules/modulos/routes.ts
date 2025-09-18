import { Router } from "express";
import {
  getBackModules,
  getBackModuleById,
  createBackModule,
  updateBackModule,
  deleteBackModule,
} from "./controller";
import {
  validateBody,
  validateMultiple,
  basicSanitization,
} from "../../middleware/zodValidation";
import { ModuleSchema, UpdateModuleSchema } from "../../types/modules";

const router = Router();

router.get("/", getBackModules);
router.get("/:id", getBackModuleById);

router.post(
  "/",
  basicSanitization,
  validateBody(ModuleSchema),
  createBackModule
);

router.put(
  "/:id",
  basicSanitization,
  validateMultiple({
    body: UpdateModuleSchema,
  }),
  updateBackModule
);

router.delete("/:id", deleteBackModule);

export default router;
