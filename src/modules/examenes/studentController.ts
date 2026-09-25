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
  MAX_INTENTOS_EXAMEN,
  mapPreguntaForStudent,
  mensajeIntentosAgotados,
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

const getIntentosAlumno = async (idAlumno: string, idExamen: string) => {
  const snapshot = await examenesRealizadosCollection
    .where("idAlumno", "==", idAlumno)
    .where("idExamen", "==", idExamen)
    .get();

  if (snapshot.empty) return { ultimo: null as any, total: 0 };

  const intentos = snapshot.docs
    .map((doc) => formatFirestoreDoc(doc))
    .sort((a: any, b: any) => {
      const aDate = new Date(a.fechaRealizacion || 0).getTime();
      const bDate = new Date(b.fechaRealizacion || 0).getTime();
      return bDate - aDate;
    });

  return { ultimo: intentos[0], total: snapshot.size };
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
    let intentosUsados = 0;
    if (examenId) {
      const intentos = await getIntentosAlumno(uid, examenId);
      ultimoIntento = intentos.ultimo;
      intentosUsados = intentos.total;
    }

    const formacionCompleta = progresoFormacion.completo;
    const examenDisponible = formacionCompleta && examenId !== null;
    const yaAprobo = ultimoIntento?.aprobado === true;
    const tieneIntentoPrevio = ultimoIntento !== null;
    const pendienteCorreccion =
      ultimoIntento?.estado === "pendiente_correccion";
    const intentosAgotados =
      intentosUsados >= MAX_INTENTOS_EXAMEN && !yaAprobo && !pendienteCorreccion;
    const puedeRealizar =
      examenId !== null &&
      !yaAprobo &&
      !pendienteCorreccion &&
      !intentosAgotados &&
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
      duracionMinutos:
        typeof examenData?.duracionMinutos === "number" &&
        examenData.duracionMinutos > 0
          ? examenData.duracionMinutos
          : 90,
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
            estado:
              ultimoIntento.estado === "pendiente_correccion"
                ? "pendiente_correccion"
                : "completado",
          }
        : null,
      puedeRealizar,
      intentosUsados,
      intentosMaximos: MAX_INTENTOS_EXAMEN,
      intentosAgotados,
      mensajeBloqueo: intentosAgotados ? mensajeIntentosAgotados() : null,
      puedeReintentar:
        examenId !== null &&
        !yaAprobo &&
        !pendienteCorreccion &&
        !intentosAgotados &&
        tieneIntentoPrevio,
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

    const { ultimo: ultimoIntento, total: intentosUsados } =
      await getIntentosAlumno(uid, idExamen);
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

    if (ultimoIntento?.estado === "pendiente_correccion") {
      return res.status(403).json({
        codigo: "EVALUACION_PENDIENTE_CORRECCION",
        error:
          "Tu último intento está pendiente de corrección. Vas a poder reintentar una vez que se corrija.",
      });
    }

    if (intentosUsados >= MAX_INTENTOS_EXAMEN) {
      return res.status(403).json({
        codigo: "INTENTOS_AGOTADOS",
        error: mensajeIntentosAgotados(),
        intentosUsados,
        intentosMaximos: MAX_INTENTOS_EXAMEN,
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
      duracionMinutos:
        typeof examenData.duracionMinutos === "number" &&
        examenData.duracionMinutos > 0
          ? examenData.duracionMinutos
          : 90,
      esReintento,
      preguntasAleatorias: aleatorio,
      preguntas: preguntasOrdenadas,
    });
  } catch (error) {
    console.error("getExamenParaAlumno error:", error);
    return res.status(500).json({ error: "Error al obtener examen" });
  }
};
