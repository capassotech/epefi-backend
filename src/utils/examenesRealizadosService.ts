import { firestore } from "../config/firebase";
import { formatFirestoreDoc } from "./utils";
import {
  ExamenPregunta,
  getTipoInputForQuestion,
  isQuestionCorrect,
  RespuestaAlumno,
} from "./examenScoring";

const examenesRealizadosCollection = firestore.collection("examenes_realizados");
const examenesCollection = firestore.collection("examenes");
const usersCollection = firestore.collection("users");
const cursosCollection = firestore.collection("cursos");

export type ExamenesRealizadosFilters = {
  idFormacion?: string;
  idExamen?: string;
  idAlumno?: string;
  searchAlumno?: string;
  aprobado?: boolean;
};

export type ExamenRealizadoEnriched = {
  id: string;
  idAlumno: string;
  nombreAlumno: string;
  emailAlumno: string;
  idFormacion: string;
  tituloFormacion: string;
  idExamen: string;
  tituloExamen: string;
  nota: number;
  porcentajeAciertos: number;
  respuestasCorrectas: number;
  totalPreguntas: number;
  aprobado: boolean;
  estado: "Aprobado" | "No aprobado";
  intentoNumero: number;
  fechaRealizacion: string;
};

const getAlumnoNombre = (userData: Record<string, unknown> | undefined): string => {
  const nombre = (userData?.nombre || "").toString().trim();
  const apellido = (userData?.apellido || "").toString().trim();
  return `${nombre} ${apellido}`.trim() || "Sin nombre";
};

const matchesAlumnoSearch = (
  userData: Record<string, unknown> | undefined,
  search: string
): boolean => {
  const term = search.toLowerCase();
  const nombre = getAlumnoNombre(userData).toLowerCase();
  const email = (userData?.email || "").toString().toLowerCase();
  const dni = (userData?.dni || "").toString().toLowerCase();
  return nombre.includes(term) || email.includes(term) || dni.includes(term);
};

export const fetchExamenesRealizadosEnriched = async (
  filters: ExamenesRealizadosFilters = {}
): Promise<ExamenRealizadoEnriched[]> => {
  let query: FirebaseFirestore.Query = examenesRealizadosCollection;

  if (filters.idFormacion) {
    query = query.where("idFormacion", "==", filters.idFormacion);
  } else if (filters.idExamen) {
    query = query.where("idExamen", "==", filters.idExamen);
  } else if (filters.idAlumno) {
    query = query.where("idAlumno", "==", filters.idAlumno);
  }

  const snapshot = await query.get();
  let records = snapshot.docs.map((doc) => formatFirestoreDoc(doc));

  if (filters.idExamen && filters.idFormacion) {
    records = records.filter((r) => r.idExamen === filters.idExamen);
  }
  if (filters.idAlumno && !filters.idFormacion && !filters.idExamen) {
    // already filtered by query
  } else if (filters.idAlumno) {
    records = records.filter((r) => r.idAlumno === filters.idAlumno);
  }

  if (filters.aprobado !== undefined) {
    records = records.filter((r) => r.aprobado === filters.aprobado);
  }

  const alumnoIds = [...new Set(records.map((r) => r.idAlumno).filter(Boolean))];
  const examenIds = [...new Set(records.map((r) => r.idExamen).filter(Boolean))];
  const formacionIds = [...new Set(records.map((r) => r.idFormacion).filter(Boolean))];

  const [userDocs, examenDocs, cursoDocs] = await Promise.all([
    Promise.all(alumnoIds.map((id) => usersCollection.doc(id).get())),
    Promise.all(examenIds.map((id) => examenesCollection.doc(id).get())),
    Promise.all(formacionIds.map((id) => cursosCollection.doc(id).get())),
  ]);

  const usersMap = new Map(
    userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
  );
  const examenesMap = new Map(
    examenDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
  );
  const cursosMap = new Map(
    cursoDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
  );

  if (filters.searchAlumno) {
    records = records.filter((r) => {
      const userData = usersMap.get(r.idAlumno);
      return matchesAlumnoSearch(userData, filters.searchAlumno!);
    });
  }

  const enriched: ExamenRealizadoEnriched[] = records.map((record) => {
    const userData = usersMap.get(record.idAlumno);
    const examenData = examenesMap.get(record.idExamen);
    const cursoData = cursosMap.get(record.idFormacion);

    return {
      id: record.id,
      idAlumno: record.idAlumno,
      nombreAlumno: getAlumnoNombre(userData),
      emailAlumno: (userData?.email || "").toString(),
      idFormacion: record.idFormacion,
      tituloFormacion: (cursoData?.titulo || "Formación sin título").toString(),
      idExamen: record.idExamen,
      tituloExamen: (examenData?.titulo || "Examen sin título").toString(),
      nota: Number(record.nota ?? 0),
      porcentajeAciertos: Number(record.porcentajeAciertos ?? 0),
      respuestasCorrectas: Number(record.respuestasCorrectas ?? 0),
      totalPreguntas: Number(record.totalPreguntas ?? 0),
      aprobado: record.aprobado === true,
      estado: record.aprobado === true ? "Aprobado" : "No aprobado",
      intentoNumero: Number(record.intentoNumero ?? 1),
      fechaRealizacion: record.fechaRealizacion || "",
    };
  });

  enriched.sort((a, b) => {
    const aTime = new Date(a.fechaRealizacion || 0).getTime();
    const bTime = new Date(b.fechaRealizacion || 0).getTime();
    return bTime - aTime;
  });

  return enriched;
};

const normalizeRespuestasAlumno = (raw: unknown): RespuestaAlumno[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => {
      const idPregunta = (item?.idPregunta || item?.preguntaId || item?.id || "")
        .toString()
        .trim();
      let seleccionadas: string[] = [];

      if (Array.isArray(item?.respuestasSeleccionadas)) {
        seleccionadas = item.respuestasSeleccionadas.map((id: unknown) =>
          String(id).trim()
        );
      } else if (item?.respuestaSeleccionada) {
        seleccionadas = [String(item.respuestaSeleccionada).trim()];
      } else if (item?.respuestaId) {
        seleccionadas = [String(item.respuestaId).trim()];
      }

      return { idPregunta, respuestasSeleccionadas: seleccionadas.filter(Boolean) };
    })
    .filter((r) => r.idPregunta);
};

export const buildExamenRealizadoDetalle = async (id: string) => {
  const doc = await examenesRealizadosCollection.doc(id).get();
  if (!doc.exists) return null;

  const record = formatFirestoreDoc(doc);
  const [userDoc, examenDoc, cursoDoc] = await Promise.all([
    usersCollection.doc(record.idAlumno).get(),
    examenesCollection.doc(record.idExamen).get(),
    cursosCollection.doc(record.idFormacion).get(),
  ]);

  const userData = userDoc.data();
  const examenData = examenDoc.data();
  const cursoData = cursoDoc.data();
  const preguntasExamen = (examenData?.preguntas || []) as ExamenPregunta[];
  const respuestasAlumno = normalizeRespuestasAlumno(record.respuestas);

  const preguntasDetalle = preguntasExamen.map((pregunta, index) => {
    const respuestaAlumno = respuestasAlumno.find(
      (r) => r.idPregunta === pregunta.id
    );
    const seleccionadasIds = respuestaAlumno?.respuestasSeleccionadas ?? [];
    const opcionesCorrectas = pregunta.respuestas.filter((r) => r.esCorrecta);

    const opciones = pregunta.respuestas.map((opcion) => ({
      id: opcion.id,
      texto: opcion.texto,
      esCorrecta: opcion.esCorrecta === true,
      seleccionadaPorAlumno: seleccionadasIds.includes(opcion.id),
    }));

    const respuestasSeleccionadas = opciones
      .filter((o) => o.seleccionadaPorAlumno)
      .map(({ id, texto, esCorrecta }) => ({ id, texto, esCorrecta }));

    const respuestasCorrectas = opcionesCorrectas.map(({ id, texto }) => ({
      id,
      texto,
    }));

    const textoRespuestasSeleccionadas = respuestasSeleccionadas
      .map((r) => r.texto)
      .join(", ");
    const textoRespuestasCorrectas = respuestasCorrectas
      .map((r) => r.texto)
      .join(", ");

    const preguntaAcertada = isQuestionCorrect(pregunta, seleccionadasIds);

    return {
      orden: index + 1,
      id: pregunta.id,
      texto: pregunta.texto,
      tipoInput: getTipoInputForQuestion(pregunta.respuestas),
      esCorrecta: preguntaAcertada,
      acertada: preguntaAcertada,
      respuestasSeleccionadas,
      respuestasCorrectas,
      textoRespuestasSeleccionadas:
        textoRespuestasSeleccionadas || "Sin respuesta",
      textoRespuestasCorrectas:
        textoRespuestasCorrectas || "Sin respuesta definida",
      opciones,
    };
  });

  return {
    id: record.id,
    idAlumno: record.idAlumno,
    nombreAlumno: getAlumnoNombre(userData),
    emailAlumno: userData?.email || "",
    dniAlumno: userData?.dni || "",
    idFormacion: record.idFormacion,
    tituloFormacion: cursoData?.titulo || "Formación sin título",
    idExamen: record.idExamen,
    tituloExamen: examenData?.titulo || "Examen sin título",
    nota: Number(record.nota ?? 0),
    porcentajeAciertos: Number(record.porcentajeAciertos ?? 0),
    respuestasCorrectas: Number(record.respuestasCorrectas ?? 0),
    totalPreguntas: Number(record.totalPreguntas ?? 0),
    aprobado: record.aprobado === true,
    estado: record.aprobado === true ? "Aprobado" : "No aprobado",
    intentoNumero: Number(record.intentoNumero ?? 1),
    fechaRealizacion: record.fechaRealizacion || "",
    respuestasAlumno,
    preguntas: preguntasDetalle,
    detallePreguntas: preguntasDetalle,
  };
};

export const parseExamenesRealizadosFilters = (
  query: Record<string, unknown>
): ExamenesRealizadosFilters => {
  const idFormacion = (query.idFormacion as string | undefined)?.trim();
  const idExamen = (query.idExamen as string | undefined)?.trim();
  const idAlumno = (query.idAlumno as string | undefined)?.trim();
  const searchAlumno =
    (query.searchAlumno as string | undefined)?.trim() ||
    (query.alumno as string | undefined)?.trim() ||
    (query.search as string | undefined)?.trim();

  let aprobado: boolean | undefined;
  const aprobadoParam = (query.aprobado as string | undefined)?.trim().toLowerCase();
  if (aprobadoParam === "true" || aprobadoParam === "aprobado") {
    aprobado = true;
  } else if (aprobadoParam === "false" || aprobadoParam === "no_aprobado") {
    aprobado = false;
  }

  return {
    idFormacion: idFormacion || undefined,
    idExamen: idExamen || undefined,
    idAlumno: idAlumno || undefined,
    searchAlumno: searchAlumno || undefined,
    aprobado,
  };
};

export const recordsToCsv = (records: ExamenRealizadoEnriched[]): string => {
  const headers = [
    "Alumno",
    "Email",
    "Formación",
    "Examen",
    "Nota",
    "Porcentaje aciertos",
    "Respuestas correctas",
    "Total preguntas",
    "Estado",
    "Intento",
    "Fecha realización",
  ];

  const escape = (value: string | number): string => {
    const str = String(value ?? "");
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map((r) =>
    [
      r.nombreAlumno,
      r.emailAlumno,
      r.tituloFormacion,
      r.tituloExamen,
      r.nota,
      `${r.porcentajeAciertos}%`,
      r.respuestasCorrectas,
      r.totalPreguntas,
      r.estado,
      r.intentoNumero,
      r.fechaRealizacion
        ? new Date(r.fechaRealizacion).toLocaleString("es-AR")
        : "",
    ]
      .map(escape)
      .join(",")
  );

  return `\uFEFF${headers.join(",")}\n${rows.join("\n")}`;
};
