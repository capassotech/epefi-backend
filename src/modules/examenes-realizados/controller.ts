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
  normalizePreguntasPuntos,
  resolveEstadoExamenRealizado,
} from "../../utils/examenScoring";
import { buildExamenRealizadoDetalle } from "../../utils/examenesRealizadosService";

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

    if (ultimoIntento?.estado === "pendiente_correccion") {
      return res.status(403).json({
        codigo: "EVALUACION_PENDIENTE_CORRECCION",
        error:
          "Tu último intento está pendiente de corrección. No podés reintentar hasta que se corrija.",
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

    const preguntasRaw = (examenData.preguntas || []) as ExamenPregunta[];
    const preguntas = normalizePreguntasPuntos(preguntasRaw);
    const esCierreForzado =
      payload.motivoCierre === "tiempo" || payload.motivoCierre === "abandono";

    // Completar respuestas faltantes en cierre por tiempo/abandono
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

    if (!esCierreForzado) {
      for (const pregunta of preguntas) {
        const respuesta = respuestasNormalizadas.find(
          (r) => r.idPregunta === pregunta.id
        );
        if (!respuesta) {
          return res.status(400).json({
            error: "Debés responder todas las preguntas del examen",
          });
        }

        if (esPreguntaDesarrollo(pregunta)) {
          if (!respuesta.respuestaDesarrollo?.trim()) {
            return res.status(400).json({
              error: "Debés responder todas las preguntas del examen",
            });
          }
          continue;
        }

        if (respuesta.respuestasSeleccionadas.length === 0) {
          return res.status(400).json({
            error: "Debés responder todas las preguntas del examen",
          });
        }
      }
    }

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
    }

    const calificacion = calculateExamenGrade(preguntas, respuestasNormalizadas);

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
    const estado = resolveEstadoExamenRealizado(preguntas);

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
      estado,
      intentoNumero,
      fechaRealizacion: now,
      motivoCierre: payload.motivoCierre ?? "envio",
    };

    const saved = await examenesRealizadosCollection.add(registro);
    const savedDoc = await saved.get();

    const mensajePorMotivo =
      payload.motivoCierre === "tiempo"
        ? "Se agotó el tiempo. El intento quedó registrado."
        : payload.motivoCierre === "abandono"
          ? "Cerraste la evaluación. El intento quedó registrado."
          : estado === "pendiente_correccion"
            ? "Evaluación enviada. Quedó pendiente de corrección."
            : calificacion.aprobado
              ? "Felicitaciones, aprobaste la evaluación"
              : "No aprobaste la evaluación. Podés reintentar cuando quieras";

    return res.status(201).json({
      message: mensajePorMotivo,
      resultado: {
        ...formatFirestoreDoc(savedDoc),
        totalPreguntas: calificacion.totalPreguntas,
        respuestasCorrectas: calificacion.respuestasCorrectas,
        puntosObtenidos: calificacion.puntosObtenidos,
        porcentajeAciertos: calificacion.porcentajeAciertos,
        nota: calificacion.nota,
        aprobado: calificacion.aprobado,
        estado,
        puedeReintentar:
          estado === "completado" && !calificacion.aprobado,
      },
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

    if (detalle.aprobado !== true) {
      return res.status(403).json({
        codigo: "DETALLE_SOLO_APROBADO",
        error:
          "El detalle del examen solo está disponible cuando aprobás la evaluación",
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

    return res.json({
      totalIntentos: intentos.length,
      ultimoIntento: ultimo,
      intentos,
      puedeReintentar: ultimo
        ? ultimo.aprobado !== true && ultimo.estado !== "pendiente_correccion"
        : true,
    });
  } catch (error) {
    console.error("getMisIntentosExamen error:", error);
    return res.status(500).json({ error: "Error al obtener intentos" });
  }
};
