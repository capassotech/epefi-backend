import { Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { formatFirestoreDoc } from "../../utils/utils";
import {
  getFormationProgress,
  studentHasFormationAssigned,
} from "../../utils/formacionProgress";
import {
  ExamenPregunta,
  mapPreguntaForStudent,
  shuffleArray,
} from "../../utils/examenScoring";

const examenesCollection = firestore.collection("examenes");
const examenesRealizadosCollection = firestore.collection("examenes_realizados");
const usersCollection = firestore.collection("users");

const getUserOr404 = async (uid: string) => {
  const userDoc = await usersCollection.doc(uid).get();
  if (!userDoc.exists) return null;
  return { id: userDoc.id, data: userDoc.data()! };
};

const getExamenDocByFormacion = async (idFormacion: string) => {
  const snapshot = await examenesCollection
    .where("idFormacion", "==", idFormacion)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0];
};

const getUltimoIntento = async (idAlumno: string, idExamen: string) => {
  const snapshot = await examenesRealizadosCollection
    .where("idAlumno", "==", idAlumno)
    .where("idExamen", "==", idExamen)
    .get();

  if (snapshot.empty) return null;

  const intentos = snapshot.docs
    .map((doc) => formatFirestoreDoc(doc))
    .sort((a: any, b: any) => {
      const aDate = new Date(a.fechaRealizacion || 0).getTime();
      const bDate = new Date(b.fechaRealizacion || 0).getTime();
      return bDate - aDate;
    });

  return intentos[0];
};

export const getExamenEstadoFormacion = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { idFormacion } = req.params;
    const uid = req.user.uid;

    const user = await getUserOr404(uid);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (!studentHasFormationAssigned(user.data.cursos_asignados, idFormacion)) {
      return res.status(403).json({
        error: "No tenés asignada esta formación",
      });
    }

    const progresoFormacion = await getFormationProgress(
      idFormacion,
      user.data.progreso || {},
      user.data.modulos_habilitados || {}
    );

    const examenDoc = await getExamenDocByFormacion(idFormacion);
    const examenId = examenDoc?.id ?? null;
    const examenData = examenDoc?.data();

    let ultimoIntento = null;
    if (examenId) {
      ultimoIntento = await getUltimoIntento(uid, examenId);
    }

    const formacionCompleta = progresoFormacion.completo;
    const examenDisponible = formacionCompleta && examenId !== null;
    const yaAprobo = ultimoIntento?.aprobado === true;
    const tieneIntentoPrevio = ultimoIntento !== null;
    const puedeRealizar =
      examenId !== null &&
      !yaAprobo &&
      (formacionCompleta || tieneIntentoPrevio);

    return res.json({
      idFormacion,
      formacionCompleta,
      progresoFormacion: {
        totalModulos: progresoFormacion.totalModulos,
        modulosCompletados: progresoFormacion.modulosCompletados,
        modulosPendientes: progresoFormacion.modulosPendientes,
      },
      examenDisponible,
      idExamen: examenId,
      tituloExamen: examenData?.titulo ?? null,
      ultimoIntento: ultimoIntento
        ? {
            id: ultimoIntento.id,
            nota: ultimoIntento.nota,
            aprobado: ultimoIntento.aprobado,
            totalPreguntas: ultimoIntento.totalPreguntas,
            respuestasCorrectas:
              ultimoIntento.respuestasCorrectas ?? ultimoIntento.preguntasCorrectas,
            porcentajeAciertos: ultimoIntento.porcentajeAciertos,
            intentoNumero: ultimoIntento.intentoNumero,
            fechaRealizacion: ultimoIntento.fechaRealizacion,
          }
        : null,
      puedeRealizar,
      puedeReintentar: examenId !== null && !yaAprobo && tieneIntentoPrevio,
    });
  } catch (error) {
    console.error("getExamenEstadoFormacion error:", error);
    return res.status(500).json({ error: "Error al obtener estado del examen" });
  }
};

export const getExamenParaAlumno = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { idExamen } = req.params;
    const uid = req.user.uid;
    const user = await getUserOr404(uid);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const examenDoc = await examenesCollection.doc(idExamen).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    const examenData = examenDoc.data()!;
    const idFormacion = examenData.idFormacion as string;

    if (!studentHasFormationAssigned(user.data.cursos_asignados, idFormacion)) {
      return res.status(403).json({
        codigo: "FORMACION_NO_ASIGNADA",
        error: "No tenés asignada esta formación",
      });
    }

    const ultimoIntento = await getUltimoIntento(uid, idExamen);
    const esReintentoNoAprobado =
      ultimoIntento !== null && ultimoIntento.aprobado !== true;

    if (ultimoIntento?.aprobado === true) {
      return res.status(403).json({
        codigo: "EVALUACION_YA_APROBADA",
        error: "Ya aprobaste esta evaluación",
        ultimoIntento: {
          nota: ultimoIntento.nota,
          aprobado: true,
          intentoNumero: ultimoIntento.intentoNumero,
        },
      });
    }

    const progresoFormacion = await getFormationProgress(
      idFormacion,
      user.data.progreso || {},
      user.data.modulos_habilitados || {}
    );

    if (!progresoFormacion.completo && !esReintentoNoAprobado) {
      return res.status(403).json({
        codigo: "MODULOS_INCOMPLETOS",
        error:
          "Debés completar todos los módulos de la formación antes de realizar la evaluación",
        progresoFormacion: {
          totalModulos: progresoFormacion.totalModulos,
          modulosCompletados: progresoFormacion.modulosCompletados,
          modulosPendientes: progresoFormacion.modulosPendientes,
        },
      });
    }

    const aleatorioExplicito =
      (req.query.aleatorio as string | undefined)?.toLowerCase() === "true" ||
      (req.query.shuffle as string | undefined)?.toLowerCase() === "true";
    const esReintento = esReintentoNoAprobado;

    const preguntas = (examenData.preguntas || []) as ExamenPregunta[];
    const preguntasParaAlumno = preguntas.map(mapPreguntaForStudent);
    const aleatorio = aleatorioExplicito || esReintento;
    const preguntasOrdenadas = aleatorio
      ? shuffleArray(preguntasParaAlumno)
      : preguntasParaAlumno;

    return res.json({
      id: examenDoc.id,
      titulo: examenData.titulo,
      idFormacion,
      esReintento,
      preguntasAleatorias: aleatorio,
      preguntas: preguntasOrdenadas,
    });
  } catch (error) {
    console.error("getExamenParaAlumno error:", error);
    return res.status(500).json({ error: "Error al obtener examen" });
  }
};
