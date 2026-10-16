import { Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";
import { MAX_INTENTOS_EXAMEN } from "../../utils/examenScoring";
import {
  countIntentosUsados,
  deleteIntentosOverride,
  listAlumnosIntentosParaExamen,
  upsertIntentosMaximosAlumno,
} from "../../utils/examenIntentosService";

const examenesCollection = firestore.collection("examenes");
const cursosCollection = firestore.collection("cursos");

const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<boolean> => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
    return false;
  }
  return true;
};

export const getAlumnosIntentosExamenAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const search = (req.query.search as string | undefined)?.trim();

    const examenDoc = await examenesCollection.doc(id).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    const examen = examenDoc.data() || {};
    const idFormacion = String(examen.idFormacion || "").trim();
    if (!idFormacion) {
      return res.status(400).json({
        error: "El examen no tiene formación asociada",
      });
    }

    const alumnos = await listAlumnosIntentosParaExamen({
      idExamen: id,
      idFormacion,
      search,
    });

    let tituloFormacion = "";
    try {
      const cursoDoc = await cursosCollection.doc(idFormacion).get();
      if (cursoDoc.exists) {
        const curso = cursoDoc.data() || {};
        tituloFormacion = String(curso.titulo || curso.nombre || "").trim();
      }
    } catch {
      // no bloquear listado si falla el nombre del curso
    }

    return res.json({
      examen: {
        id,
        titulo: examen.titulo || "",
        idFormacion,
        tituloFormacion,
      },
      intentosDefault: MAX_INTENTOS_EXAMEN,
      alumnos,
    });
  } catch (error) {
    console.error("getAlumnosIntentosExamenAdmin error:", error);
    return res.status(500).json({
      error: "Error al listar intentos de alumnos",
    });
  }
};

export const upsertIntentosExamenAlumnoAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id, idAlumno } = req.params;
    const intentosMaximos = Number(req.body?.intentosMaximos);

    const examenDoc = await examenesCollection.doc(id).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    const examen = examenDoc.data() || {};
    const idFormacion = String(examen.idFormacion || "").trim();
    if (!idFormacion) {
      return res.status(400).json({
        error: "El examen no tiene formación asociada",
      });
    }

    const override = await upsertIntentosMaximosAlumno({
      idAlumno,
      idExamen: id,
      idFormacion,
      intentosMaximos,
      updatedBy: req.user.uid,
    });

    return res.json({
      message: "Intentos actualizados",
      override,
    });
  } catch (error) {
    console.error("upsertIntentosExamenAlumnoAdmin error:", error);
    const message =
      error instanceof Error ? error.message : "Error al actualizar intentos";
    return res.status(400).json({ error: message });
  }
};

export const resetIntentosExamenAlumnoAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id, idAlumno } = req.params;
    const examenDoc = await examenesCollection.doc(id).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    const usados = await countIntentosUsados(idAlumno, id);
    if (usados > MAX_INTENTOS_EXAMEN) {
      return res.status(400).json({
        error: `No se puede restablecer al default (${MAX_INTENTOS_EXAMEN}): el alumno ya usó ${usados} intentos`,
      });
    }

    await deleteIntentosOverride(idAlumno, id);

    return res.json({
      message: "Se restableció el límite por defecto",
      intentosDefault: MAX_INTENTOS_EXAMEN,
    });
  } catch (error) {
    console.error("resetIntentosExamenAlumnoAdmin error:", error);
    return res.status(500).json({
      error: "Error al restablecer intentos",
    });
  }
};
