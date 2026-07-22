import { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateUser } from "../../utils/utils";
import {
  buildExamenRealizadoDetalle,
  fetchExamenesRealizadosEnriched,
  parseExamenesRealizadosFilters,
  recordsToCsv,
} from "../../utils/examenesRealizadosService";

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
