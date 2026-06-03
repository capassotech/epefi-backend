import { Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { ValidatedSubmitExamen } from "../../types/schemas";
import { formatFirestoreDoc } from "../../utils/utils";
import {
  getFormationProgress,
  studentHasFormationAssigned,
} from "../../utils/formacionProgress";
import {
  calculateExamenGrade,
  ExamenPregunta,
} from "../../utils/examenScoring";

const examenesCollection = firestore.collection("examenes");
const examenesRealizadosCollection = firestore.collection("examenes_realizados");
const usersCollection = firestore.collection("users");

export const submitExamenRealizado = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;
    const payload: ValidatedSubmitExamen = req.body;

    const userDoc = await usersCollection.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const userData = userDoc.data()!;

    if (
      !studentHasFormationAssigned(userData.cursos_asignados, payload.idFormacion)
    ) {
      return res.status(403).json({
        error: "No tenés asignada esta formación",
      });
    }

    const examenDoc = await examenesCollection.doc(payload.idExamen).get();
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    const examenData = examenDoc.data()!;
    if (examenData.idFormacion !== payload.idFormacion) {
      return res.status(400).json({
        error: "El examen no corresponde a la formación indicada",
      });
    }

    const progresoFormacion = await getFormationProgress(
      payload.idFormacion,
      userData.progreso || {},
      userData.modulos_habilitados || {}
    );

    const intentosPrevios = await examenesRealizadosCollection
      .where("idAlumno", "==", uid)
      .where("idExamen", "==", payload.idExamen)
      .get();

    const intentosOrdenados = intentosPrevios.docs
      .map((doc) => doc.data())
      .sort(
        (a, b) =>
          Number(b.intentoNumero || 0) - Number(a.intentoNumero || 0)
      );

    const ultimoIntento = intentosOrdenados[0];
    const esReintentoNoAprobado =
      ultimoIntento !== undefined && ultimoIntento.aprobado !== true;

    if (ultimoIntento?.aprobado === true) {
      return res.status(403).json({
        codigo: "EVALUACION_YA_APROBADA",
        error: "Ya aprobaste esta evaluación",
      });
    }

    if (!progresoFormacion.completo && !esReintentoNoAprobado) {
      return res.status(403).json({
        codigo: "MODULOS_INCOMPLETOS",
        error:
          "Debés completar todos los módulos de la formación antes de enviar la evaluación",
        progresoFormacion: {
          totalModulos: progresoFormacion.totalModulos,
          modulosCompletados: progresoFormacion.modulosCompletados,
          modulosPendientes: progresoFormacion.modulosPendientes,
        },
      });
    }

    const preguntas = (examenData.preguntas || []) as ExamenPregunta[];
    const preguntaIds = new Set(preguntas.map((p) => p.id));
    const respuestasIds = new Set(payload.respuestas.map((r) => r.idPregunta));

    if (respuestasIds.size !== preguntaIds.size) {
      return res.status(400).json({
        error: "Debés responder todas las preguntas del examen",
      });
    }

    for (const idPregunta of preguntaIds) {
      if (!respuestasIds.has(idPregunta)) {
        return res.status(400).json({
          error: "Debés responder todas las preguntas del examen",
        });
      }
    }

    for (const respuesta of payload.respuestas) {
      const pregunta = preguntas.find((p) => p.id === respuesta.idPregunta);
      if (!pregunta) {
        return res.status(400).json({
          error: `Pregunta inválida: ${respuesta.idPregunta}`,
        });
      }

      const opcionesValidas = new Set(pregunta.respuestas.map((r) => r.id));
      for (const opcionId of respuesta.respuestasSeleccionadas) {
        if (!opcionesValidas.has(opcionId)) {
          return res.status(400).json({
            error: `Respuesta inválida para la pregunta ${respuesta.idPregunta}`,
          });
        }
      }

      const correctas = pregunta.respuestas.filter((r) => r.esCorrecta).length;
      if (correctas === 1 && respuesta.respuestasSeleccionadas.length !== 1) {
        return res.status(400).json({
          error: `La pregunta ${respuesta.idPregunta} admite una sola respuesta`,
        });
      }
      if (correctas > 1 && respuesta.respuestasSeleccionadas.length === 0) {
        return res.status(400).json({
          error: `La pregunta ${respuesta.idPregunta} requiere al menos una respuesta`,
        });
      }
    }

    const calificacion = calculateExamenGrade(preguntas, payload.respuestas);

    if (calificacion.totalPreguntas === 0) {
      return res.status(400).json({
        error: "El examen no tiene preguntas configuradas",
      });
    }

    const intentoNumero = (ultimoIntento?.intentoNumero || 0) + 1;
    const now = new Date();

    const registro = {
      idAlumno: uid,
      idExamen: payload.idExamen,
      idFormacion: payload.idFormacion,
      respuestas: payload.respuestas,
      totalPreguntas: calificacion.totalPreguntas,
      respuestasCorrectas: calificacion.respuestasCorrectas,
      porcentajeAciertos: calificacion.porcentajeAciertos,
      nota: calificacion.nota,
      aprobado: calificacion.aprobado,
      intentoNumero,
      fechaRealizacion: now,
    };

    const saved = await examenesRealizadosCollection.add(registro);
    const savedDoc = await saved.get();

    return res.status(201).json({
      message: calificacion.aprobado
        ? "Felicitaciones, aprobaste la evaluación"
        : "No aprobaste la evaluación. Podés reintentar cuando quieras",
      resultado: {
        ...formatFirestoreDoc(savedDoc),
        totalPreguntas: calificacion.totalPreguntas,
        respuestasCorrectas: calificacion.respuestasCorrectas,
        porcentajeAciertos: calificacion.porcentajeAciertos,
        nota: calificacion.nota,
        aprobado: calificacion.aprobado,
        puedeReintentar: !calificacion.aprobado,
      },
    });
  } catch (error) {
    console.error("submitExamenRealizado error:", error);
    return res.status(500).json({ error: "Error al guardar el examen realizado" });
  }
};

export const getMisIntentosExamen = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;
    const { idExamen } = req.params;

    const snapshot = await examenesRealizadosCollection
      .where("idAlumno", "==", uid)
      .where("idExamen", "==", idExamen)
      .get();

    const intentos = snapshot.docs
      .map((doc) => formatFirestoreDoc(doc))
      .sort((a: any, b: any) => {
        const aDate = new Date(a.fechaRealizacion || 0).getTime();
        const bDate = new Date(b.fechaRealizacion || 0).getTime();
        return bDate - aDate;
      });

    const ultimo = intentos[0] ?? null;

    return res.json({
      totalIntentos: intentos.length,
      ultimoIntento: ultimo,
      intentos,
      puedeReintentar: ultimo ? ultimo.aprobado !== true : true,
    });
  } catch (error) {
    console.error("getMisIntentosExamen error:", error);
    return res.status(500).json({ error: "Error al obtener intentos" });
  }
};
