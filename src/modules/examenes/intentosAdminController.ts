import { invalidateExamenCache } from "../../utils/examenCache";
import { Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";
import {
  getIntentosDefaultExamen,
  isRevisionPermitida,
} from "../../utils/examenScoring";
import {
  countIntentosUsados,
  deleteIntentosOverride,
  listAlumnosIntentosParaExamen,
  setRevisionHabilitadaAlumno,
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
        error: "El examen no tiene curso asociado",
      });
    }

    const intentosDefault = getIntentosDefaultExamen(examen);
    const alumnos = await listAlumnosIntentosParaExamen({
      idExamen: id,
      idFormacion,
      intentosDefault,
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
      intentosDefault,
      permitirRevision: isRevisionPermitida(examen),
      alumnos,
    });
  } catch (error) {
    console.error("getAlumnosIntentosExamenAdmin error:", error);
    return res.status(500).json({
      error: "Error al listar intentos de alumnos",
    });
  }
};

/** Límite general de intentos del examen: aplica a todos los alumnos sin override. */
export const setIntentosDefaultExamenAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const intentosMaximos = Math.floor(Number(req.body?.intentosMaximos));
    if (!Number.isFinite(intentosMaximos) || intentosMaximos < 1) {
      return res.status(400).json({
        error: "Los intentos máximos deben ser un entero mayor o igual a 1",
      });
    }

    const examenDoc = await examenesCollection.doc(id).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    await examenesCollection.doc(id).update({
      intentosMaximos,
      fechaActualizacion: new Date(),
    });
    invalidateExamenCache();

    return res.json({
      message: "Límite general de intentos actualizado",
      intentosDefault: intentosMaximos,
    });
  } catch (error) {
    console.error("setIntentosDefaultExamenAdmin error:", error);
    return res.status(500).json({
      error: "Error al actualizar el límite general de intentos",
    });
  }
};

/** Excepción manual: habilita/deshabilita la revisión del examen para un alumno. */
export const setRevisionExamenAlumnoAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id, idAlumno } = req.params;
    const habilitada = req.body?.habilitada;
    if (typeof habilitada !== "boolean") {
      return res.status(400).json({
        error: 'El campo "habilitada" debe ser un booleano',
      });
    }

    const examenDoc = await examenesCollection.doc(id).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    await setRevisionHabilitadaAlumno({
      idAlumno,
      idExamen: id,
      idFormacion: String(examenDoc.data()?.idFormacion || "").trim(),
      habilitada,
      updatedBy: req.user.uid,
    });

    return res.json({
      message: habilitada
        ? "Revisión habilitada para el alumno"
        : "Se quitó la habilitación manual de revisión",
      revisionHabilitada: habilitada,
    });
  } catch (error) {
    console.error("setRevisionExamenAlumnoAdmin error:", error);
    return res.status(500).json({
      error: "Error al actualizar la revisión del alumno",
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
        error: "El examen no tiene curso asociado",
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

    const intentosDefault = getIntentosDefaultExamen(examenDoc.data());
    const usados = await countIntentosUsados(idAlumno, id);
    if (usados > intentosDefault) {
      return res.status(400).json({
        error: `No se puede restablecer al default (${intentosDefault}): el alumno ya usó ${usados} intentos`,
      });
    }

    await deleteIntentosOverride(idAlumno, id);

    return res.json({
      message: "Se restableció el límite por defecto",
      intentosDefault,
    });
  } catch (error) {
    console.error("resetIntentosExamenAlumnoAdmin error:", error);
    return res.status(500).json({
      error: "Error al restablecer intentos",
    });
  }
};
