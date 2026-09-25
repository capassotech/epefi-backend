import { Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type { ValidatedCorregirExamen } from "../../types/schemas";
import { validateUser } from "../../utils/utils";
import {
  computeGradeFromPuntosObtenidos,
  esPreguntaDesarrollo,
  roundPuntos,
} from "../../utils/examenScoring";
import {
  buildExamenRealizadoDetalle,
  fetchExamenesRealizadosEnriched,
  parseExamenesRealizadosFilters,
  recordsToCsv,
} from "../../utils/examenesRealizadosService";

const examenesRealizadosCollection = firestore.collection("examenes_realizados");

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

export const getExamenesRealizadosAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const filters = parseExamenesRealizadosFilters(req.query);
    const pageParam = Number.parseInt(req.query.page as string, 10);
    const limitParam = Number.parseInt(req.query.limit as string, 10);
    const page = Number.isNaN(pageParam) ? 1 : Math.max(pageParam, 1);
    const perPage = Number.isNaN(limitParam) ? 20 : Math.max(limitParam, 1);

    const allRecords = await fetchExamenesRealizadosEnriched(filters);
    const total = allRecords.length;
    const start = (page - 1) * perPage;
    const data = allRecords.slice(start, start + perPage);

    return res.json({
      data,
      pagination: {
        total,
        page,
        perPage,
        count: data.length,
        totalPages: total === 0 ? 0 : Math.ceil(total / perPage),
      },
      filters,
    });
  } catch (error) {
    console.error("getExamenesRealizadosAdmin error:", error);
    return res.status(500).json({ error: "Error al obtener exámenes realizados" });
  }
};

export const getExamenRealizadoDetalleAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const detalle = await buildExamenRealizadoDetalle(id);

    if (!detalle) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    return res.json(detalle);
  } catch (error) {
    console.error("getExamenRealizadoDetalleAdmin error:", error);
    return res.status(500).json({ error: "Error al obtener detalle del examen" });
  }
};

/**
 * Corrige preguntas de desarrollo: asigna puntaje + comentario opcional,
 * recalcula nota final y pasa el intento a estado "completado".
 */
export const corregirExamenRealizadoAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { id } = req.params;
    const payload: ValidatedCorregirExamen = req.body;

    const docRef = examenesRealizadosCollection.doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }

    const record = doc.data() || {};
    if (record.estado !== "pendiente_correccion") {
      return res.status(400).json({
        error: "Solo se pueden corregir exámenes en estado pendiente de corrección",
      });
    }

    const preguntas = Array.isArray(record.preguntas) ? [...record.preguntas] : [];
    if (preguntas.length === 0) {
      return res.status(400).json({
        error: "El intento no tiene preguntas guardadas para corregir",
      });
    }

    const desarrolloIds = preguntas
      .filter((p: any) => esPreguntaDesarrollo(p))
      .map((p: any) => String(p.id ?? p.idPregunta ?? "").trim())
      .filter(Boolean);

    if (desarrolloIds.length === 0) {
      return res.status(400).json({
        error: "Este examen no tiene preguntas de desarrollo para corregir",
      });
    }

    const correccionesById = new Map(
      payload.correcciones.map((c) => [c.idPregunta, c])
    );

    for (const desarrolloId of desarrolloIds) {
      if (!correccionesById.has(desarrolloId)) {
        return res.status(400).json({
          error: `Falta corregir la pregunta de desarrollo: ${desarrolloId}`,
        });
      }
    }

    for (const correccion of payload.correcciones) {
      if (!desarrolloIds.includes(correccion.idPregunta)) {
        return res.status(400).json({
          error: `La pregunta ${correccion.idPregunta} no es de desarrollo`,
        });
      }
    }

    const preguntasActualizadas = preguntas.map((pregunta: any) => {
      const preguntaId = String(pregunta.id ?? pregunta.idPregunta ?? "").trim();
      if (!esPreguntaDesarrollo(pregunta)) {
        return pregunta;
      }

      const correccion = correccionesById.get(preguntaId);
      if (!correccion) return pregunta;

      const maxPuntos = roundPuntos(Number(pregunta.puntos ?? 0));
      const puntosObtenidos = roundPuntos(correccion.puntosObtenidos);

      if (puntosObtenidos > maxPuntos) {
        throw new Error(
          `Los puntos de la pregunta ${preguntaId} no pueden superar ${maxPuntos}`
        );
      }

      const comentario = (correccion.comentario || "").trim();
      const acertada = maxPuntos > 0 && puntosObtenidos >= maxPuntos;

      return {
        ...pregunta,
        puntosObtenidos,
        acertada,
        esCorrecta: acertada,
        ...(comentario ? { comentario } : { comentario: "" }),
      };
    });

    let puntosObtenidosTotal = 0;
    let respuestasCorrectas = 0;
    for (const pregunta of preguntasActualizadas) {
      const pts = Number(pregunta.puntosObtenidos ?? 0);
      puntosObtenidosTotal += pts;
      if (pregunta.acertada === true || pregunta.esCorrecta === true) {
        respuestasCorrectas++;
      }
    }
    puntosObtenidosTotal = roundPuntos(puntosObtenidosTotal);
    const grade = computeGradeFromPuntosObtenidos(puntosObtenidosTotal);

    await docRef.update({
      preguntas: preguntasActualizadas,
      puntosObtenidos: grade.puntosObtenidos,
      porcentajeAciertos: grade.porcentajeAciertos,
      nota: grade.nota,
      aprobado: grade.aprobado,
      respuestasCorrectas,
      estado: "completado",
      fechaCorreccion: new Date(),
      corregidoPor: req.user.uid,
    });

    const detalle = await buildExamenRealizadoDetalle(id);
    return res.json({
      message: "Examen corregido correctamente",
      resultado: detalle,
    });
  } catch (error) {
    console.error("corregirExamenRealizadoAdmin error:", error);
    const message =
      error instanceof Error ? error.message : "Error al corregir el examen";
    if (message.includes("no pueden superar")) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: "Error al corregir el examen" });
  }
};

export const exportExamenesRealizadosAdmin = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const filters = parseExamenesRealizadosFilters(req.query);
    const format = ((req.query.format as string) || "csv").trim().toLowerCase();
    const records = await fetchExamenesRealizadosEnriched(filters);
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx" || format === "excel") {
      const XLSX = await import("xlsx");
      const rows = records.map((r) => ({
        Alumno: r.nombreAlumno,
        Email: r.emailAlumno,
        Formación: r.tituloFormacion,
        Examen: r.tituloExamen,
        Nota: r.nota,
        "Porcentaje aciertos": r.porcentajeAciertos,
        "Respuestas correctas": r.respuestasCorrectas,
        "Total preguntas": r.totalPreguntas,
        Estado: r.estado,
        Intento: r.intentoNumero,
        "Fecha realización": r.fechaRealizacion
          ? new Date(r.fechaRealizacion).toLocaleString("es-AR")
          : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Exámenes realizados");
      const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="examenes-realizados-${timestamp}.xlsx"`
      );
      return res.send(buffer);
    }

    const csv = recordsToCsv(records);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="examenes-realizados-${timestamp}.csv"`
    );
    return res.send(csv);
  } catch (error) {
    console.error("exportExamenesRealizadosAdmin error:", error);
    return res.status(500).json({ error: "Error al exportar exámenes realizados" });
  }
};
