import { Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedExamen } from "../../types/schemas";
import { formatFirestoreDoc, validateUser } from "../../utils/utils";
import type { ExamenPregunta } from "../../utils/examenScoring";
import {
  backfillSnapshotsForExamen,
  saveExamenPreguntasVersion,
} from "../../utils/examenSnapshotService";

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

const verifyFormacionExists = async (idFormacion: string): Promise<boolean> => {
  const cursoDoc = await cursosCollection.doc(idFormacion).get();
  return cursoDoc.exists;
};

export const getAllExamenes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const idFormacion = (req.query.idFormacion as string | undefined)?.trim();
    const titulo = (req.query.titulo as string | undefined)?.trim().toLowerCase();
    const search = (req.query.search as string | undefined)?.trim().toLowerCase();
    const sortBy = ((req.query.sortBy as string | undefined) || "titulo").trim();
    const sortOrderParam = ((req.query.sortOrder as string | undefined) || "asc")
      .trim()
      .toLowerCase();
    const sortOrder = sortOrderParam === "desc" ? "desc" : "asc";

    let query: FirebaseFirestore.Query = examenesCollection;
    if (idFormacion) {
      query = query.where("idFormacion", "==", idFormacion);
    }

    const examenesSnapshot = await query.get();

    if (examenesSnapshot.empty) {
      return res.json([]);
    }

    let examenes = examenesSnapshot.docs.map((doc) => formatFirestoreDoc(doc));

    if (titulo) {
      examenes = examenes.filter((examen: any) =>
        (examen?.titulo || "").toString().toLowerCase().includes(titulo)
      );
    }

    if (search) {
      examenes = examenes.filter((examen: any) => {
        const examenTitulo = (examen?.titulo || "").toString().toLowerCase();
        const examenFormacion = (examen?.idFormacion || "")
          .toString()
          .toLowerCase();
        return (
          examenTitulo.includes(search) || examenFormacion.includes(search)
        );
      });
    }

    examenes.sort((a: any, b: any) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      if (sortBy === "idFormacion") {
        aValue = (a?.idFormacion || "").toString().toLowerCase();
        bValue = (b?.idFormacion || "").toString().toLowerCase();
      } else if (sortBy === "fechaCreacion") {
        const aDate = a?.fechaCreacion || a?.fechaRegistro || null;
        const bDate = b?.fechaCreacion || b?.fechaRegistro || null;
        aValue = aDate ? new Date(aDate).getTime() : 0;
        bValue = bDate ? new Date(bDate).getTime() : 0;
      } else {
        aValue = (a?.titulo || "").toString().toLowerCase();
        bValue = (b?.titulo || "").toString().toLowerCase();
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return res.json(examenes);
  } catch (error) {
    console.error("getAllExamenes error:", error);
    return res.status(500).json({ error: "Error al obtener exámenes" });
  }
};

export const getExamenById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const examenDoc = await examenesCollection.doc(id).get();

    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    return res.json(formatFirestoreDoc(examenDoc));
  } catch (error) {
    console.error("getExamenById error:", error);
    return res.status(500).json({ error: "Error al obtener examen" });
  }
};

export const createExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const examenData: ValidatedExamen = req.body;

    const formacionExists = await verifyFormacionExists(examenData.idFormacion);
    if (!formacionExists) {
      return res.status(404).json({ error: "Formación no encontrada" });
    }

    const now = new Date();
    const examenToCreate = {
      ...examenData,
      duracionMinutos:
        typeof examenData.duracionMinutos === "number"
          ? examenData.duracionMinutos
          : 90,
      fechaCreacion: now,
      fechaActualizacion: now,
    };

    const nuevoExamen = await examenesCollection.add(examenToCreate);
    const createdDoc = await nuevoExamen.get();

    return res.status(201).json(formatFirestoreDoc(createdDoc));
  } catch (error) {
    console.error("createExamen error:", error);
    return res.status(500).json({ error: "Error al crear examen" });
  }
};

export const updateExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const examenData: ValidatedExamen = req.body;

    const examenDoc = await examenesCollection.doc(id).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    const formacionExists = await verifyFormacionExists(examenData.idFormacion);
    if (!formacionExists) {
      return res.status(404).json({ error: "Formación no encontrada" });
    }

    const existingData = examenDoc.data();
    const preguntasAnteriores = (existingData?.preguntas ||
      []) as ExamenPregunta[];

    // Congelar preguntas actuales en intentos sin snapshot + historial de versión
    // ANTES de sobrescribir el examen, para que los detalles no se rompan.
    if (preguntasAnteriores.length > 0) {
      try {
        await Promise.all([
          saveExamenPreguntasVersion(id, preguntasAnteriores),
          backfillSnapshotsForExamen(id, preguntasAnteriores),
        ]);
      } catch (snapshotError) {
        console.error(
          "No se pudo preservar snapshot/historial antes de editar examen:",
          snapshotError
        );
        // Seguimos con la actualización; el snapshot en submit cubre intentos nuevos
      }
    }

    const now = new Date();
    const examenToUpdate = {
      ...examenData,
      duracionMinutos:
        typeof examenData.duracionMinutos === "number"
          ? examenData.duracionMinutos
          : typeof existingData?.duracionMinutos === "number"
            ? existingData.duracionMinutos
            : 90,
      fechaCreacion: existingData?.fechaCreacion ?? now,
      fechaActualizacion: now,
    };

    await examenesCollection.doc(id).set(examenToUpdate);
    const updatedDoc = await examenesCollection.doc(id).get();

    return res.json({
      message: "Examen actualizado correctamente",
      ...formatFirestoreDoc(updatedDoc),
    });
  } catch (error) {
    console.error("updateExamen error:", error);
    return res.status(500).json({ error: "Error al actualizar examen" });
  }
};

export const deleteExamen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const examenDoc = await examenesCollection.doc(id).get();

    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    await examenesCollection.doc(id).delete();

    return res.json({
      message: "Examen eliminado correctamente",
      id,
    });
  } catch (error) {
    console.error("deleteExamen error:", error);
    return res.status(500).json({ error: "Error al eliminar examen" });
  }
};
