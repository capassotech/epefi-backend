/** Porcentaje mínimo de aciertos para aprobar (no cantidad fija de respuestas). */
export const PORCENTAJE_MINIMO_APROBACION = 70;

/** @deprecated Usar PORCENTAJE_MINIMO_APROBACION y porcentajeAciertos */
export const NOTA_MINIMA_APROBACION = 7;

/** Puntos totales que debe sumar el examen. */
export const PUNTOS_TOTAL_EXAMEN = 100;

export type TipoPregunta = "opcion_multiple" | "desarrollo";

export type EstadoExamenRealizado = "completado" | "pendiente_correccion";

export type ExamenPregunta = {
  id: string;
  texto: string;
  puntos?: number;
  /** Por defecto opcion_multiple (exámenes legacy). */
  tipoPregunta?: TipoPregunta;
  respuestas: Array<{
    id: string;
    texto: string;
    esCorrecta: boolean;
  }>;
};

export type RespuestaAlumno = {
  idPregunta: string;
  respuestasSeleccionadas: string[];
  respuestaDesarrollo?: string;
};

export const resolveTipoPregunta = (
  pregunta: { tipoPregunta?: TipoPregunta | string | null }
): TipoPregunta =>
  pregunta.tipoPregunta === "desarrollo" ? "desarrollo" : "opcion_multiple";

export const esPreguntaDesarrollo = (
  pregunta: { tipoPregunta?: TipoPregunta | string | null }
): boolean => resolveTipoPregunta(pregunta) === "desarrollo";

/** True si al menos una pregunta es de desarrollo. */
export const tienePreguntasDesarrollo = (
  preguntas: Array<{ tipoPregunta?: TipoPregunta | string | null }>
): boolean => preguntas.some((p) => esPreguntaDesarrollo(p));

export const resolveEstadoExamenRealizado = (
  preguntas: Array<{ tipoPregunta?: TipoPregunta | string | null }>
): EstadoExamenRealizado =>
  tienePreguntasDesarrollo(preguntas) ? "pendiente_correccion" : "completado";

export type ExamenCalificacionResult = {
  totalPreguntas: number;
  respuestasCorrectas: number;
  puntosObtenidos: number;
  porcentajeAciertos: number;
  nota: number;
  aprobado: boolean;
};

export const computeGradeFromPuntosObtenidos = (
  puntosObtenidos: number
): Pick<
  ExamenCalificacionResult,
  "puntosObtenidos" | "porcentajeAciertos" | "nota" | "aprobado"
> => {
  const porcentajeAciertos = roundToOneDecimal(
    (puntosObtenidos / PUNTOS_TOTAL_EXAMEN) * 100
  );
  const nota = roundToOneDecimal((porcentajeAciertos / 100) * 10);
  const aprobado = porcentajeAciertos >= PORCENTAJE_MINIMO_APROBACION;

  return { puntosObtenidos, porcentajeAciertos, nota, aprobado };
};

export const roundToOneDecimal = (value: number): number =>
  Math.round(value * 10) / 10;

export const getTipoInputForQuestion = (
  respuestas: Array<{ esCorrecta: boolean }>,
  tipoPregunta?: TipoPregunta | string | null
): "radio" | "checkbox" | "textarea" => {
  if (resolveTipoPregunta({ tipoPregunta }) === "desarrollo") {
    return "textarea";
  }
  const correctas = respuestas.filter((r) => r.esCorrecta === true).length;
  return correctas === 1 ? "radio" : "checkbox";
};

export const mapPreguntaForStudent = (pregunta: ExamenPregunta) => {
  const tipoPregunta = resolveTipoPregunta(pregunta);
  if (tipoPregunta === "desarrollo") {
    return {
      id: pregunta.id,
      texto: pregunta.texto,
      tipoPregunta,
      tipoInput: "textarea" as const,
      respuestas: [] as Array<{ id: string; texto: string }>,
    };
  }
  return {
    id: pregunta.id,
    texto: pregunta.texto,
    tipoPregunta,
    tipoInput: getTipoInputForQuestion(pregunta.respuestas, tipoPregunta),
    respuestas: (pregunta.respuestas || []).map(({ id, texto }) => ({ id, texto })),
  };
};

/** Redondea puntos a 2 decimales (centésimas). */
export const roundPuntos = (value: number): number =>
  Math.round(value * 100) / 100;

/** True si la suma (con 2 decimales) alcanza el total del examen. */
export const puntosSumEqualsTotal = (sum: number): boolean =>
  roundPuntos(sum) === PUNTOS_TOTAL_EXAMEN;

/**
 * Reparte 100 puntos en partes lo más equitativas posible, con hasta 2 decimales.
 * Ej.: 3 preguntas → [33.34, 33.33, 33.33]
 */
export const distributePuntosEqually = (count: number): number[] => {
  if (count <= 0) return [];

  const totalCents = Math.round(PUNTOS_TOTAL_EXAMEN * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainder = totalCents - baseCents * count;

  return Array.from({ length: count }, (_, index) =>
    roundPuntos((baseCents + (index < remainder ? 1 : 0)) / 100)
  );
};

export const getPreguntaPuntos = (
  pregunta: ExamenPregunta,
  index: number,
  totalPreguntas: number
): number => {
  if (typeof pregunta.puntos === "number" && pregunta.puntos >= 0) {
    return pregunta.puntos;
  }
  if (totalPreguntas <= 0) return 0;
  return distributePuntosEqually(totalPreguntas)[index] ?? 0;
};

export const normalizePreguntasPuntos = <T extends { puntos?: number }>(
  preguntas: T[]
): Array<T & { puntos: number }> => {
  if (preguntas.length === 0) return [];

  const allHavePuntos = preguntas.every(
    (pregunta) => typeof pregunta.puntos === "number" && pregunta.puntos > 0
  );
  const noneHavePuntos = preguntas.every(
    (pregunta) => pregunta.puntos == null || pregunta.puntos === undefined
  );

  if (noneHavePuntos) {
    const distribution = distributePuntosEqually(preguntas.length);
    return preguntas.map((pregunta, index) => ({
      ...pregunta,
      puntos: distribution[index],
    }));
  }

  if (!allHavePuntos) {
    throw new Error("Todas las preguntas deben tener puntos asignados");
  }

  const sum = preguntas.reduce((acc, pregunta) => acc + (pregunta.puntos ?? 0), 0);
  if (!puntosSumEqualsTotal(sum)) {
    throw new Error(
      `La suma de puntos debe ser ${PUNTOS_TOTAL_EXAMEN} (actual: ${roundPuntos(sum)})`
    );
  }

  return preguntas.map((pregunta) => ({
    ...pregunta,
    puntos: roundPuntos(pregunta.puntos!),
  }));
};

export const isQuestionCorrect = (
  pregunta: ExamenPregunta,
  respuestasSeleccionadas: string[]
): boolean => {
  const correctIds = pregunta.respuestas
    .filter((r) => r.esCorrecta === true)
    .map((r) => r.id)
    .sort();

  const selectedIds = [...respuestasSeleccionadas].sort();

  if (correctIds.length !== selectedIds.length) return false;
  return correctIds.every((id, index) => id === selectedIds[index]);
};

export type PreguntaExamenSnapshot = {
  id: string;
  texto: string;
  puntos: number;
  tipoPregunta: TipoPregunta;
  respuestas: Array<{
    id: string;
    texto: string;
    esCorrecta: boolean;
  }>;
};

/** Copia inmutable de las preguntas al momento de rendir. */
export const buildPreguntasSnapshot = (
  preguntas: Array<ExamenPregunta & { puntos?: number }>
): PreguntaExamenSnapshot[] => {
  const total = preguntas.length;
  return preguntas.map((pregunta, index) => ({
    id: pregunta.id,
    texto: pregunta.texto,
    puntos: getPreguntaPuntos(pregunta, index, total),
    tipoPregunta: resolveTipoPregunta(pregunta),
    respuestas: esPreguntaDesarrollo(pregunta)
      ? []
      : (pregunta.respuestas || []).map((r) => ({
          id: r.id,
          texto: r.texto,
          esCorrecta: r.esCorrecta === true,
        })),
  }));
};

export type PreguntaExamenRealizadoGuardada = PreguntaExamenSnapshot & {
  puntosObtenidos: number;
  acertada: boolean;
  esCorrecta: boolean;
  respuestasSeleccionadas: string[];
  respuestaDesarrollo?: string;
};

/** Snapshot + resultado por pregunta para persistir en el intento. */
export const buildPreguntasExamenRealizado = (
  preguntas: Array<ExamenPregunta & { puntos?: number }>,
  respuestasAlumno: RespuestaAlumno[]
): PreguntaExamenRealizadoGuardada[] => {
  const total = preguntas.length;
  return preguntas.map((pregunta, index) => {
    const puntos = getPreguntaPuntos(pregunta, index, total);
    const respAlumno = respuestasAlumno.find((r) => r.idPregunta === pregunta.id);
    const seleccionadas = respAlumno?.respuestasSeleccionadas ?? [];
    const desarrollo = esPreguntaDesarrollo(pregunta);
    // Desarrollo: no se auto-corrige; queda en 0 hasta corrección manual
    const acertada = desarrollo
      ? false
      : isQuestionCorrect(pregunta, seleccionadas);
    return {
      id: pregunta.id,
      texto: pregunta.texto,
      puntos,
      tipoPregunta: resolveTipoPregunta(pregunta),
      puntosObtenidos: desarrollo ? 0 : acertada ? puntos : 0,
      acertada,
      esCorrecta: acertada,
      respuestas: desarrollo
        ? []
        : (pregunta.respuestas || []).map((r) => ({
            id: r.id,
            texto: r.texto,
            esCorrecta: r.esCorrecta === true,
          })),
      respuestasSeleccionadas: desarrollo ? [] : seleccionadas,
      ...(desarrollo
        ? { respuestaDesarrollo: respAlumno?.respuestaDesarrollo?.trim() || "" }
        : {}),
    };
  });
};

export const calculateExamenGrade = (
  preguntas: ExamenPregunta[],
  respuestasAlumno: RespuestaAlumno[]
): ExamenCalificacionResult => {
  const totalPreguntas = preguntas.length;

  if (totalPreguntas === 0) {
    return {
      totalPreguntas: 0,
      respuestasCorrectas: 0,
      puntosObtenidos: 0,
      porcentajeAciertos: 0,
      nota: 0,
      aprobado: false,
    };
  }

  let respuestasCorrectas = 0;
  let puntosObtenidos = 0;

  preguntas.forEach((pregunta, index) => {
    // Preguntas de desarrollo no se auto-califican
    if (esPreguntaDesarrollo(pregunta)) return;

    const puntosPregunta = getPreguntaPuntos(pregunta, index, totalPreguntas);
    const respuesta = respuestasAlumno.find((r) => r.idPregunta === pregunta.id);
    const seleccionadas = respuesta?.respuestasSeleccionadas ?? [];
    if (isQuestionCorrect(pregunta, seleccionadas)) {
      respuestasCorrectas++;
      puntosObtenidos += puntosPregunta;
    }
  });

  const grade = computeGradeFromPuntosObtenidos(puntosObtenidos);

  // Si hay desarrollo pendiente, no se aprueba hasta la corrección manual
  if (tienePreguntasDesarrollo(preguntas)) {
    return {
      totalPreguntas,
      respuestasCorrectas,
      puntosObtenidos: grade.puntosObtenidos,
      porcentajeAciertos: grade.porcentajeAciertos,
      nota: grade.nota,
      aprobado: false,
    };
  }

  return {
    totalPreguntas,
    respuestasCorrectas,
    ...grade,
  };
};

export const shuffleArray = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
