import { firestore } from "../config/firebase";
import { formatFirestoreDoc } from "./utils";
import {
  computeGradeFromPuntosObtenidos,
  esPreguntaDesarrollo,
  ExamenPregunta,
  getPreguntaPuntos,
  getTipoInputForQuestion,
  isQuestionCorrect,
  normalizePreguntasPuntos,
  resolveTipoPregunta,
  RespuestaAlumno,
  TipoPregunta,
} from "./examenScoring";
import {
  findPreguntasFromExamenHistorial,
  intentoTieneSnapshot,
  lazyBackfillIntentoSnapshot,
} from "./examenSnapshotService";

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
  /** Etiqueta de aprobación para CSV / listado legacy. */
  estado: "Aprobado" | "No aprobado";
  /** Estado de corrección del intento (schema examenes_realizados). */
  estadoCorreccion: "completado" | "pendiente_correccion";
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
      estadoCorreccion:
        record.estado === "pendiente_correccion"
          ? "pendiente_correccion"
          : "completado",
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
        seleccionadas = item.respuestasSeleccionadas.map((id: unknown) => {
          if (id != null && typeof id === "object") {
            const o = id as Record<string, unknown>;
            return String(o.id ?? o.idRespuesta ?? "").trim();
          }
          return String(id).trim();
        });
      } else if (item?.respuestaSeleccionada) {
        seleccionadas = [String(item.respuestaSeleccionada).trim()];
      } else if (item?.respuestaId) {
        seleccionadas = [String(item.respuestaId).trim()];
      }

      return {
        idPregunta,
        respuestasSeleccionadas: seleccionadas.filter(Boolean),
        ...(typeof item?.respuestaDesarrollo === "string"
          ? { respuestaDesarrollo: item.respuestaDesarrollo }
          : {}),
      };
    })
    .filter((r) => r.idPregunta);
};

const asPreguntaSnapshot = (raw: unknown): ExamenPregunta | null => {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = String(p.id ?? p.idPregunta ?? "").trim();
  if (!id) return null;

  const tipoPregunta = resolveTipoPregunta({
    tipoPregunta: p.tipoPregunta as TipoPregunta | undefined,
  });

  const respuestasRaw = Array.isArray(p.respuestas)
    ? p.respuestas
    : Array.isArray(p.opciones)
      ? p.opciones
      : [];

  return {
    id,
    texto: String(p.texto ?? p.pregunta ?? ""),
    puntos: typeof p.puntos === "number" ? p.puntos : undefined,
    tipoPregunta,
    respuestas:
      tipoPregunta === "desarrollo"
        ? []
        : respuestasRaw.map((r: any) => ({
            id: String(r?.id ?? ""),
            texto: String(r?.texto ?? r?.text ?? ""),
            esCorrecta: Boolean(r?.esCorrecta ?? r?.correcta ?? r?.isCorrect),
          })),
  };
};

const isValidResolvedPregunta = (q: ExamenPregunta | null): q is ExamenPregunta => {
  if (!q) return false;
  if (esPreguntaDesarrollo(q)) return true;
  return q.respuestas.length > 0;
};

/**
 * Fuente de preguntas del intento:
 * 1) Snapshot guardado al rendir (preguntas / preguntasSnapshot)
 * 2) Historial de versiones del examen (si se editó después)
 * 3) Legacy: plantilla actual, limitada a las preguntas respondidas
 */
const resolvePreguntasDelIntento = async (
  record: Record<string, any>,
  examenData: FirebaseFirestore.DocumentData | undefined
): Promise<{ preguntas: ExamenPregunta[]; fromLiveMatch: boolean }> => {
  const fromSavedPreguntas = Array.isArray(record.preguntas)
    ? record.preguntas
        .map(asPreguntaSnapshot)
        .filter(isValidResolvedPregunta)
    : [];
  if (fromSavedPreguntas.length > 0) {
    return { preguntas: fromSavedPreguntas, fromLiveMatch: false };
  }

  const fromSnapshot = Array.isArray(record.preguntasSnapshot)
    ? record.preguntasSnapshot
        .map(asPreguntaSnapshot)
        .filter(isValidResolvedPregunta)
    : [];
  if (fromSnapshot.length > 0) {
    return { preguntas: fromSnapshot, fromLiveMatch: false };
  }

  const respuestasAlumno = normalizeRespuestasAlumno(record.respuestas);
  const answeredIds = respuestasAlumno.map((r) => r.idPregunta);
  const livePreguntas = ((examenData?.preguntas || []) as ExamenPregunta[]) || [];

  // Historial de versiones del examen (antes de ediciones posteriores)
  if (record.idExamen && answeredIds.length > 0) {
    const fromHistorial = await findPreguntasFromExamenHistorial(
      String(record.idExamen),
      answeredIds
    );
    if (fromHistorial?.length) {
      return { preguntas: fromHistorial, fromLiveMatch: false };
    }
  }

  // Legacy: solo IDs respondidos en el examen vivo
  if (answeredIds.length > 0) {
    const liveById = new Map(livePreguntas.map((q) => [String(q.id), q]));
    const matched = answeredIds
      .map((id) => liveById.get(String(id)))
      .filter((q): q is ExamenPregunta => q != null);

    if (matched.length === answeredIds.length) {
      return { preguntas: matched, fromLiveMatch: true };
    }

    // Mezcla: las que existen + stubs para las eliminadas (sin inventar texto)
    if (matched.length > 0) {
      return {
        preguntas: answeredIds.map((id) => {
          const live = liveById.get(String(id));
          if (live) return live;
          return {
            id,
            texto:
              "Pregunta no disponible (fue modificada o eliminada del examen después de este intento)",
            respuestas: [],
          };
        }),
        fromLiveMatch: false,
      };
    }

    return {
      preguntas: answeredIds.map((id) => ({
        id,
        texto:
          "Pregunta no disponible (fue modificada o eliminada del examen después de este intento)",
        respuestas: [],
      })),
      fromLiveMatch: false,
    };
  }

  return { preguntas: livePreguntas, fromLiveMatch: livePreguntas.length > 0 };
};

const buildPreguntaDetalle = (
  pregunta: ExamenPregunta,
  index: number,
  totalPreguntas: number,
  seleccionadasIds: string[],
  savedPregunta?: Record<string, any>,
  gradeHints?: {
    porcentajeAciertos?: number;
    puntosObtenidosTotal?: number;
  },
  respuestaDesarrollo?: string
) => {
  const tipoPregunta = resolveTipoPregunta(pregunta);
  const esDesarrollo = tipoPregunta === "desarrollo";
  const puntos =
    typeof savedPregunta?.puntos === "number"
      ? savedPregunta.puntos
      : getPreguntaPuntos(pregunta, index, totalPreguntas);

  if (esDesarrollo) {
    const textoDesarrollo =
      (typeof respuestaDesarrollo === "string" && respuestaDesarrollo) ||
      (typeof savedPregunta?.respuestaDesarrollo === "string"
        ? savedPregunta.respuestaDesarrollo
        : "") ||
      "";

    const puntosObtenidos =
      typeof savedPregunta?.puntosObtenidos === "number"
        ? savedPregunta.puntosObtenidos
        : 0;

    const preguntaAcertada =
      typeof savedPregunta?.acertada === "boolean"
        ? savedPregunta.acertada
        : typeof savedPregunta?.esCorrecta === "boolean"
          ? savedPregunta.esCorrecta
          : false;

    return {
      orden: index + 1,
      id: pregunta.id,
      texto: pregunta.texto,
      puntos,
      puntosObtenidos,
      tipoPregunta,
      tipoInput: "textarea" as const,
      esCorrecta: preguntaAcertada === true,
      acertada: preguntaAcertada === true,
      preguntaNoDisponible: false,
      respuestas: [] as Array<{ id: string; texto: string; esCorrecta: boolean }>,
      idsRespuestasSeleccionadas: [] as string[],
      respuestasSeleccionadas: [] as Array<{
        id: string;
        texto: string;
        esCorrecta: boolean;
      }>,
      respuestasCorrectas: [] as Array<{ id: string; texto: string }>,
      respuestaDesarrollo: textoDesarrollo,
      textoRespuestasSeleccionadas: textoDesarrollo || "Sin respuesta",
      textoRespuestasCorrectas: "Pendiente de corrección",
      opciones: [] as Array<{
        id: string;
        texto: string;
        esCorrecta: boolean;
        seleccionadaPorAlumno: boolean;
      }>,
    };
  }

  const opciones = pregunta.respuestas.map((opcion) => ({
    id: opcion.id,
    texto: opcion.texto,
    esCorrecta: opcion.esCorrecta === true,
    seleccionadaPorAlumno: seleccionadasIds.includes(opcion.id),
  }));

  const respuestas = opciones.map(({ id, texto, esCorrecta }) => ({
    id,
    texto,
    esCorrecta,
  }));

  const respuestasSeleccionadas = opciones
    .filter((o) => o.seleccionadaPorAlumno)
    .map(({ id, texto, esCorrecta }) => ({ id, texto, esCorrecta }));

  // Si no hay opciones (pregunta eliminada sin snapshot), mostrar al menos los IDs elegidos
  const respuestasSeleccionadasFallback =
    respuestasSeleccionadas.length > 0
      ? respuestasSeleccionadas
      : seleccionadasIds.map((id) => ({
          id,
          texto: `Opción seleccionada (${id})`,
          esCorrecta: false,
        }));

  const opcionesCorrectas = pregunta.respuestas.filter((r) => r.esCorrecta);
  const respuestasCorrectas = opcionesCorrectas.map(({ id, texto }) => ({
    id,
    texto,
  }));

  const sinOpciones = pregunta.respuestas.length === 0;

  let preguntaAcertada =
    typeof savedPregunta?.acertada === "boolean"
      ? savedPregunta.acertada
      : typeof savedPregunta?.esCorrecta === "boolean"
        ? savedPregunta.esCorrecta
        : sinOpciones
          ? undefined
          : isQuestionCorrect(pregunta, seleccionadasIds);

  // Intentos legacy sin opciones: inferir desde la nota global guardada
  if (preguntaAcertada === undefined && sinOpciones) {
    const pct = gradeHints?.porcentajeAciertos;
    if (typeof pct === "number") {
      if (pct >= 100) preguntaAcertada = true;
      else if (pct <= 0) preguntaAcertada = false;
    }
  }

  const puntosObtenidos =
    typeof savedPregunta?.puntosObtenidos === "number"
      ? savedPregunta.puntosObtenidos
      : preguntaAcertada === true
        ? puntos
        : preguntaAcertada === false
          ? 0
          : 0;

  return {
    orden: index + 1,
    id: pregunta.id,
    texto: pregunta.texto,
    puntos,
    puntosObtenidos,
    tipoPregunta,
    tipoInput: getTipoInputForQuestion(pregunta.respuestas, tipoPregunta),
    esCorrecta: preguntaAcertada === true,
    acertada: preguntaAcertada === true,
    preguntaNoDisponible: sinOpciones,
    respuestas,
    idsRespuestasSeleccionadas: seleccionadasIds,
    respuestasSeleccionadas: respuestasSeleccionadasFallback,
    respuestasCorrectas,
    textoRespuestasSeleccionadas:
      respuestasSeleccionadasFallback.map((r) => r.texto).join(", ") ||
      "Sin respuesta",
    textoRespuestasCorrectas:
      respuestasCorrectas.map((r) => r.texto).join(", ") ||
      (sinOpciones ? "No disponible" : "Sin respuesta definida"),
    opciones:
      opciones.length > 0
        ? opciones
        : seleccionadasIds.map((id) => ({
            id,
            texto: `Opción seleccionada (${id})`,
            esCorrecta: false,
            seleccionadaPorAlumno: true,
          })),
  };
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

  const resolved = await resolvePreguntasDelIntento(record, examenData);
  const preguntasFuente = resolved.preguntas;
  let preguntasExamen: ExamenPregunta[];
  try {
    preguntasExamen = normalizePreguntasPuntos(preguntasFuente);
  } catch {
    const distribution = preguntasFuente.map((p, i) =>
      getPreguntaPuntos(p, i, preguntasFuente.length)
    );
    preguntasExamen = preguntasFuente.map((p, i) => ({
      ...p,
      puntos: typeof p.puntos === "number" ? p.puntos : distribution[i],
    }));
  }

  const respuestasAlumno = normalizeRespuestasAlumno(record.respuestas);
  const savedPreguntasById = new Map<string, Record<string, any>>();
  if (Array.isArray(record.preguntas)) {
    for (const p of record.preguntas) {
      const pid = String(p?.id ?? p?.idPregunta ?? "").trim();
      if (pid) savedPreguntasById.set(pid, p);
    }
  }

  // Congelar snapshot si todavía podemos (examen vivo coincide)
  if (resolved.fromLiveMatch && !intentoTieneSnapshot(record)) {
    lazyBackfillIntentoSnapshot(
      id,
      record,
      preguntasExamen,
      respuestasAlumno
    ).catch((err) =>
      console.error("lazyBackfillIntentoSnapshot error:", err)
    );
  }

  const intentosSnapshot = await examenesRealizadosCollection
    .where("idAlumno", "==", record.idAlumno)
    .where("idExamen", "==", record.idExamen)
    .get();
  const totalIntentos = intentosSnapshot.size;

  const gradeHints = {
    porcentajeAciertos:
      typeof record.porcentajeAciertos === "number"
        ? Number(record.porcentajeAciertos)
        : undefined,
    puntosObtenidosTotal:
      typeof record.puntosObtenidos === "number"
        ? Number(record.puntosObtenidos)
        : undefined,
  };

  const preguntasDetalle = preguntasExamen.map((pregunta, index) => {
    const saved = savedPreguntasById.get(pregunta.id);
    const fromRespuestas = respuestasAlumno.find(
      (r) => r.idPregunta === pregunta.id
    );
    const fromSavedSeleccion = Array.isArray(saved?.respuestasSeleccionadas)
      ? saved!
          .respuestasSeleccionadas.map((sid: unknown) => {
            if (sid != null && typeof sid === "object") {
              const o = sid as Record<string, unknown>;
              return String(o.id ?? "").trim();
            }
            return String(sid).trim();
          })
          .filter(Boolean)
      : [];
    const seleccionadasIds =
      fromRespuestas?.respuestasSeleccionadas?.length
        ? fromRespuestas.respuestasSeleccionadas
        : fromSavedSeleccion;

    const respuestaDesarrollo =
      fromRespuestas?.respuestaDesarrollo ||
      (typeof saved?.respuestaDesarrollo === "string"
        ? saved.respuestaDesarrollo
        : undefined);

    return buildPreguntaDetalle(
      pregunta,
      index,
      preguntasExamen.length,
      seleccionadasIds,
      saved,
      gradeHints,
      respuestaDesarrollo
    );
  });

  const hasStoredGrade =
    typeof record.nota === "number" ||
    typeof record.puntosObtenidos === "number" ||
    typeof record.porcentajeAciertos === "number";

  const puntosFromDetalle = preguntasDetalle.reduce(
    (acc, pregunta) => acc + pregunta.puntosObtenidos,
    0
  );
  const correctasFromDetalle = preguntasDetalle.filter((p) => p.acertada).length;
  const gradeFromDetalle = computeGradeFromPuntosObtenidos(puntosFromDetalle);

  const puntosObtenidos = hasStoredGrade
    ? Number(record.puntosObtenidos ?? gradeFromDetalle.puntosObtenidos)
    : gradeFromDetalle.puntosObtenidos;
  const porcentajeAciertos = hasStoredGrade
    ? Number(
        record.porcentajeAciertos ??
          computeGradeFromPuntosObtenidos(puntosObtenidos).porcentajeAciertos
      )
    : gradeFromDetalle.porcentajeAciertos;
  const nota = hasStoredGrade
    ? Number(record.nota ?? computeGradeFromPuntosObtenidos(puntosObtenidos).nota)
    : gradeFromDetalle.nota;
  const aprobado = hasStoredGrade
    ? record.aprobado === true
    : gradeFromDetalle.aprobado;
  const totalPreguntas = Number(
    record.totalPreguntas ?? preguntasExamen.length
  );
  const respuestasCorrectas = Number(
    record.respuestasCorrectas ?? correctasFromDetalle
  );

  const preguntasRecuperables = preguntasDetalle.some(
    (p) => !p.preguntaNoDisponible
  );
  const tieneSnapshot = intentoTieneSnapshot(record);

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
    nota,
    porcentajeAciertos,
    puntosObtenidos,
    respuestasCorrectas,
    totalPreguntas,
    aprobado,
    estado: aprobado ? "Aprobado" : "No aprobado",
    estadoCorreccion:
      record.estado === "pendiente_correccion"
        ? "pendiente_correccion"
        : "completado",
    intentoNumero: Number(record.intentoNumero ?? 1),
    totalIntentos,
    fechaRealizacion: record.fechaRealizacion || "",
    respuestasAlumno,
    preguntas: preguntasDetalle,
    detallePreguntas: preguntasDetalle,
    tieneSnapshot,
    detalleIncompleto: !tieneSnapshot && !preguntasRecuperables,
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
