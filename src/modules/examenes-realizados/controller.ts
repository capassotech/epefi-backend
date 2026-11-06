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
  buildPreguntasExamenRealizado,
  buildPreguntasSnapshot,
  calculateExamenGrade,
  esPreguntaDesarrollo,
  ExamenPregunta,
  getIntentosDefaultExamen,
  isExamenHabilitado,
  MENSAJE_EXAMEN_DESHABILITADO,
  mensajeIntentosAgotados,
  normalizePreguntasPuntos,
  resolveEstadoExamenRealizado,
} from "../../utils/examenScoring";
import {
  isRevisionHabilitadaAlumno,
  puedeRevisarExamen,
  resolveIntentosMaximos,
  resolvePuedeRevisarExamen,
} from "../../utils/examenIntentosService";
import { buildExamenRealizadoDetalle } from "../../utils/examenesRealizadosService";
import { getExamenDocCached } from "../../utils/examenCache";

const examenesCollection = firestore.collection("examenes");
const examenesRealizadosCollection = firestore.collection("examenes_realizados");
const usersCollection = firestore.collection("users");

/** Código de Firestore cuando el documento ya existe. */
const FIRESTORE_ALREADY_EXISTS = 6;

/**
 * Arma la respuesta del envío. Es la misma para un envío nuevo y para un reintento, y no incluye
 * las preguntas: llevan las respuestas correctas y el alumno todavía puede tener intentos.
 */
const responderEnvio = async (params: {
  res: Response;
  status: number;
  id: string;
  registro: Record<string, any>;
  fechaRealizacion: unknown;
  examenData: FirebaseFirestore.DocumentData;
  uid: string;
  intentosContados: number;
  intentosMaximos: number;
}) => {
  const { res, status, id, registro, fechaRealizacion, examenData, uid, intentosContados, intentosMaximos } = params;
  const { estado, aprobado, motivoCierre, intentoNumero } = registro;
  const publicacionManual = examenData.publicacionManualDeNota === true;
  const ahoraAgotoIntentos = intentosContados >= intentosMaximos;

  const puedeReintentar = estado === "completado" && !aprobado && !ahoraAgotoIntentos;
  const puedeRevisar =
    estado === "completado" &&
    puedeRevisarExamen({
      examenData,
      aprobado,
      intentosUsados: intentosContados,
      intentosMaximos,
      revisionHabilitadaAlumno: await isRevisionHabilitadaAlumno(uid, registro.idExamen),
    });

  const mensajePorMotivo =
    motivoCierre === "tiempo" && estado === "pendiente_correccion"
      ? publicacionManual
        ? "Se agotó el tiempo. Tu evaluación fue enviada y la nota será publicada por el administrador en las próximas horas."
        : "Se agotó el tiempo. Tu evaluación fue enviada y quedó pendiente de corrección."
      : motivoCierre === "tiempo"
      ? ahoraAgotoIntentos
        ? "Se agotó el tiempo. El intento quedó registrado y alcanzaste el máximo de intentos."
        : "Se agotó el tiempo. El intento quedó registrado."
      : motivoCierre === "abandono"
        ? ahoraAgotoIntentos
          ? "Cerraste la evaluación. El intento quedó registrado y alcanzaste el máximo de intentos."
          : "Cerraste la evaluación. El intento quedó registrado."
        : estado === "pendiente_correccion"
          ? publicacionManual
            ? "Tu evaluación fue enviada. La nota será publicada por el administrador en las próximas horas."
            : "Evaluación enviada. Quedó pendiente de corrección."
          : aprobado
            ? "Felicitaciones, aprobaste la evaluación"
            : ahoraAgotoIntentos
              ? mensajeIntentosAgotados(intentosMaximos)
              : "No aprobaste la evaluación. Podés reintentar cuando quieras";

  return res.status(status).json({
    message: mensajePorMotivo,
    resultado: {
      id,
      idExamen: registro.idExamen,
      idFormacion: registro.idFormacion,
      fechaRealizacion,
      motivoCierre,
      notaMinima: registro.notaMinima,
      totalPreguntas: registro.totalPreguntas,
      respuestasCorrectas: registro.respuestasCorrectas,
      puntosObtenidos: registro.puntosObtenidos,
      porcentajeAciertos: registro.porcentajeAciertos,
      nota: registro.nota,
      aprobado,
      estado,
      intentoNumero,
      intentosUsados: intentoNumero,
      intentosMaximos,
      puedeReintentar,
      puedeRevisar,
      publicacionManualDeNota: publicacionManual,
    },
  });
};

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
        error: "No tenés asignado este curso",
      });
    }

    const examenDoc = await getExamenDocCached(payload.idExamen);
    if (!examenDoc.exists) {
      return res.status(404).json({ error: "Examen no encontrado" });
    }

    const examenData = examenDoc.data()!;
    if (examenData.idFormacion !== payload.idFormacion) {
      return res.status(400).json({
        error: "El examen no corresponde al curso indicado",
      });
    }

    const intentoRef = payload.idEnvio
      ? examenesRealizadosCollection.doc(`${uid}__${payload.idExamen}__${payload.idEnvio}`)
      : examenesRealizadosCollection.doc();

    // El alumno reenvía cuando no le llegó la respuesta: si ya se guardó, devolver ese resultado.
    // Va antes de las demás validaciones, que ahora rechazarían al intento que ya está registrado.
    const responderYaGuardado = async () => {
      const guardado = await intentoRef.get();
      if (!guardado.exists) return null;
      return responderEnvio({
        res,
        status: 200,
        id: guardado.id,
        registro: guardado.data()!,
        fechaRealizacion: formatFirestoreDoc(guardado).fechaRealizacion,
        examenData,
        uid,
        intentosContados: guardado.data()!.intentoNumero,
        intentosMaximos: await resolveIntentosMaximos(
          uid,
          payload.idExamen,
          payload.idFormacion,
          getIntentosDefaultExamen(examenData)
        ),
      });
    };

    if (payload.idEnvio) {
      const respuesta = await responderYaGuardado();
      if (respuesta) return respuesta;
    }

    if (!isExamenHabilitado(examenData)) {
      return res.status(403).json({
        codigo: "EXAMEN_DESHABILITADO",
        error: MENSAJE_EXAMEN_DESHABILITADO,
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
    const intentosUsados = intentosPrevios.size;
    const intentosMaximos = await resolveIntentosMaximos(
      uid,
      payload.idExamen,
      payload.idFormacion,
      getIntentosDefaultExamen(examenData)
    );
    const esReintentoNoAprobado =
      ultimoIntento !== undefined && ultimoIntento.aprobado !== true;

    if (ultimoIntento?.aprobado === true) {
      return res.status(403).json({
        codigo: "EVALUACION_YA_APROBADA",
        error: "Ya aprobaste esta evaluación",
      });
    }

    if (ultimoIntento?.estado === "pendiente_correccion") {
      return res.status(403).json({
        codigo: "EVALUACION_PENDIENTE_CORRECCION",
        error:
          "Tu último intento está pendiente de corrección. No podés reintentar hasta que se corrija.",
      });
    }

    if (intentosUsados >= intentosMaximos) {
      return res.status(403).json({
        codigo: "INTENTOS_AGOTADOS",
        error: mensajeIntentosAgotados(intentosMaximos),
        intentosUsados,
        intentosMaximos,
      });
    }

    const requiereCompletarCurso = examenData.requiereCompletarCurso !== false;
    if (requiereCompletarCurso && !progresoFormacion.completo && !esReintentoNoAprobado) {
      return res.status(403).json({
        codigo: "MODULOS_INCOMPLETOS",
        error:
          "Debés completar todos los módulos del curso antes de enviar la evaluación",
        progresoFormacion: {
          totalModulos: progresoFormacion.totalModulos,
          modulosCompletados: progresoFormacion.modulosCompletados,
          modulosPendientes: progresoFormacion.modulosPendientes,
        },
      });
    }

    const preguntasRaw = (examenData.preguntas || []) as ExamenPregunta[];
    const preguntas = normalizePreguntasPuntos(preguntasRaw);
    const esCierreForzado =
      payload.motivoCierre === "tiempo" || payload.motivoCierre === "abandono";

    // Completar respuestas faltantes: las preguntas sin responder cuentan como incorrectas
    const respuestasPorPregunta = new Map(
      payload.respuestas.map((r) => [
        r.idPregunta,
        {
          respuestasSeleccionadas: r.respuestasSeleccionadas ?? [],
          respuestaDesarrollo: r.respuestaDesarrollo?.trim() || "",
        },
      ])
    );
    const respuestasNormalizadas = preguntas.map((pregunta) => {
      const raw = respuestasPorPregunta.get(pregunta.id);
      if (esPreguntaDesarrollo(pregunta)) {
        return {
          idPregunta: pregunta.id,
          respuestasSeleccionadas: [] as string[],
          respuestaDesarrollo: raw?.respuestaDesarrollo || "",
        };
      }
      return {
        idPregunta: pregunta.id,
        respuestasSeleccionadas: raw?.respuestasSeleccionadas ?? [],
      };
    });

    for (const respuesta of respuestasNormalizadas) {
      const pregunta = preguntas.find((p) => p.id === respuesta.idPregunta);
      if (!pregunta) {
        return res.status(400).json({
          error: `Pregunta inválida: ${respuesta.idPregunta}`,
        });
      }

      if (esPreguntaDesarrollo(pregunta)) {
        continue;
      }

      const opcionesValidas = new Set(
        (pregunta.respuestas || []).map((r) => r.id)
      );
      for (const opcionId of respuesta.respuestasSeleccionadas) {
        if (!opcionesValidas.has(opcionId)) {
          return res.status(400).json({
            error: `Respuesta inválida para la pregunta ${respuesta.idPregunta}`,
          });
        }
      }

      if (!esCierreForzado) {
        const correctas = (pregunta.respuestas || []).filter(
          (r) => r.esCorrecta
        ).length;
        if (correctas === 1 && respuesta.respuestasSeleccionadas.length > 1) {
          return res.status(400).json({
            error: `La pregunta ${respuesta.idPregunta} admite una sola respuesta`,
          });
        }
      }
    }

    const notaMinimaExamen =
      typeof examenData.notaMinima === "number" && examenData.notaMinima > 0
        ? examenData.notaMinima
        : 70;
    const calificacion = calculateExamenGrade(preguntas, respuestasNormalizadas, notaMinimaExamen);

    if (calificacion.totalPreguntas === 0) {
      return res.status(400).json({
        error: "El examen no tiene preguntas configuradas",
      });
    }

    // Snapshot inmutable: ediciones posteriores del examen no alteran este intento
    const preguntasSnapshot = buildPreguntasSnapshot(preguntas);
    const preguntasDetalle = buildPreguntasExamenRealizado(
      preguntas,
      respuestasNormalizadas
    );
    // Solo el abandono cierra sin corrección manual: el tiempo agotado sigue el mismo camino que un
    // envío normal, para que el docente corrija el desarrollo y se respete la publicación manual.
    const publicacionManual = examenData.publicacionManualDeNota === true;
    const estado = payload.motivoCierre === "abandono"
      ? "completado"
      : publicacionManual
        ? "pendiente_correccion"
        : resolveEstadoExamenRealizado(preguntas);

    const intentoNumero = (ultimoIntento?.intentoNumero || 0) + 1;
    const now = new Date();

    const registro = {
      idAlumno: uid,
      idExamen: payload.idExamen,
      idFormacion: payload.idFormacion,
      respuestas: respuestasNormalizadas,
      preguntasSnapshot,
      preguntas: preguntasDetalle,
      totalPreguntas: calificacion.totalPreguntas,
      respuestasCorrectas: calificacion.respuestasCorrectas,
      puntosObtenidos: calificacion.puntosObtenidos,
      porcentajeAciertos: calificacion.porcentajeAciertos,
      nota: calificacion.nota,
      aprobado: calificacion.aprobado,
      notaMinima: notaMinimaExamen,
      estado,
      intentoNumero,
      fechaRealizacion: now,
      motivoCierre: payload.motivoCierre ?? "envio",
    };

    try {
      await intentoRef.create(registro);
    } catch (error: any) {
      // Dos reenvíos del mismo envío al mismo tiempo: el otro ya lo guardó
      if (error?.code === FIRESTORE_ALREADY_EXISTS) {
        const respuesta = await responderYaGuardado();
        if (respuesta) return respuesta;
      }
      throw error;
    }

    return await responderEnvio({
      res,
      status: 201,
      id: intentoRef.id,
      registro,
      fechaRealizacion: now.toISOString(),
      examenData,
      uid,
      intentosContados: intentosUsados + 1,
      intentosMaximos,
    });
  } catch (error) {
    console.error("submitExamenRealizado error:", error);
    return res.status(500).json({ error: "Error al guardar el examen realizado" });
  }
};

export const getMiExamenRealizadoDetalle = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;

    const detalle = await buildExamenRealizadoDetalle(id);
    if (!detalle) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    if (detalle.idAlumno !== uid) {
      return res.status(403).json({
        error: "No tenés permiso para ver este examen realizado",
      });
    }

    if (detalle.estado === "pendiente_correccion") {
      return res.status(403).json({
        codigo: "DETALLE_PENDIENTE_CORRECCION",
        error:
          "El detalle del examen estará disponible una vez que el docente lo corrija",
      });
    }

    const examenDoc = await examenesCollection.doc(detalle.idExamen).get();
    const puedeRevisar = await resolvePuedeRevisarExamen(
      uid,
      detalle.idExamen,
      examenDoc.data()
    );
    if (!puedeRevisar) {
      return res.status(403).json({
        codigo: "REVISION_NO_DISPONIBLE",
        error:
          "La revisión del examen estará disponible cuando apruebes o uses todos tus intentos",
      });
    }

    const {
      emailAlumno: _emailAlumno,
      dniAlumno: _dniAlumno,
      nombreAlumno: _nombreAlumno,
      ...studentDetalle
    } = detalle;

    return res.json(studentDetalle);
  } catch (error) {
    console.error("getMiExamenRealizadoDetalle error:", error);
    return res.status(500).json({ error: "Error al obtener detalle del examen" });
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
    const examenDoc = await examenesCollection.doc(idExamen).get();
    const intentosMaximos = await resolveIntentosMaximos(
      uid,
      idExamen,
      undefined,
      getIntentosDefaultExamen(examenDoc.data())
    );

    return res.json({
      totalIntentos: intentos.length,
      ultimoIntento: ultimo,
      intentos,
      intentosMaximos,
      puedeReintentar: ultimo
        ? ultimo.aprobado !== true &&
          ultimo.estado !== "pendiente_correccion" &&
          intentos.length < intentosMaximos
        : true,
    });
  } catch (error) {
    console.error("getMisIntentosExamen error:", error);
    return res.status(500).json({ error: "Error al obtener intentos" });
  }
};
