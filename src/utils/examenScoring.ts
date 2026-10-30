
export const PORCENTAJE_MINIMO_APROBACION = 70;

export const NOTA_MINIMA_APROBACION = 7;

export const PUNTOS_TOTAL_EXAMEN = 100;

export const MAX_INTENTOS_EXAMEN = 3;

export const isExamenHabilitado = (
  data?: { habilitado?: boolean } | null
): boolean => data?.habilitado !== false;

export const MENSAJE_EXAMEN_DESHABILITADO =
  "Esta evaluación aún no está disponible. Las evaluaciones se habilitarán según el plan de estudios. Si tenés alguna consulta, comunicate con tu profesor.";

export const mensajeIntentosAgotados = (max = MAX_INTENTOS_EXAMEN): string =>
  `Alcanzaste el máximo de ${max} intentos. La evaluación quedó bloqueada y ya no podés volver a realizarla.`;

export type TipoPregunta = "opcion_multiple" | "desarrollo";

export type EstadoExamenRealizado = "completado" | "pendiente_correccion";

export type ExamenPregunta = {
  id: string;
  texto: string;
  puntos?: number;
  tipoPregunta?: TipoPregunta;
  imagenUrl?: string;
  imagenPath?: string;
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
  puntosObtenidos: number,
  notaMinimaAprobacion: number = PORCENTAJE_MINIMO_APROBACION
): Pick<
  ExamenCalificacionResult,
  "puntosObtenidos" | "porcentajeAciertos" | "nota" | "aprobado"
> => {
  const porcentajeAciertos = roundToOneDecimal(
    (puntosObtenidos / PUNTOS_TOTAL_EXAMEN) * 100
  );
  const nota = roundToOneDecimal((porcentajeAciertos / 100) * 10);
  const aprobado = porcentajeAciertos >= notaMinimaAprobacion;

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
  const imagenUrl =
    typeof pregunta.imagenUrl === "string" && pregunta.imagenUrl.trim()
      ? pregunta.imagenUrl.trim()
      : undefined;

  if (tipoPregunta === "desarrollo") {
    return {
      id: pregunta.id,
      texto: pregunta.texto,
      tipoPregunta,
      tipoInput: "textarea" as const,
      ...(imagenUrl ? { imagenUrl } : {}),
      respuestas: [] as Array<{ id: string; texto: string }>,
    };
  }
  return {
    id: pregunta.id,
    texto: pregunta.texto,
    tipoPregunta,
    tipoInput: getTipoInputForQuestion(pregunta.respuestas, tipoPregunta),
    ...(imagenUrl ? { imagenUrl } : {}),
    respuestas: (pregunta.respuestas || []).map(({ id, texto }) => ({ id, texto })),
  };
};

export const roundPuntos = (value: number): number =>
  Math.round(value * 100) / 100;

export const puntosSumEqualsTotal = (sum: number): boolean =>
  roundPuntos(sum) === PUNTOS_TOTAL_EXAMEN;


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

/**
 * Calcula los puntos fraccionados para una pregunta de opción múltiple.
 *
 * - Base: (correctas_marcadas / totalCorrectas) × puntosPregunta
 *   → marcar solo las correctas da el puntaje completo.
 * - Penalidad: incorrectasMarcadas × (puntosPregunta / totalOpciones)
 *   → cada incorrecta seleccionada descuenta su fracción del total de opciones.
 * - Resultado tiene piso en 0.
 *
 * Ej.: 3 opciones (2 correctas, 1 incorrecta), puntos = 100:
 *   - Solo las 2 correctas:           (2/2 × 100) − 0       = 100
 *   - Las 2 correctas + 1 incorrecta: (2/2 × 100) − 33.33   = 66.67
 *   - Solo 1 correcta:                (1/2 × 100) − 0       = 50
 */
export const getQuestionFractionalPoints = (
  pregunta: ExamenPregunta,
  respuestasSeleccionadas: string[],
  puntosPregunta: number
): number => {
  const totalOpciones = pregunta.respuestas.length;
  if (totalOpciones === 0) return 0;

  const correctIds = new Set(
    pregunta.respuestas.filter((r) => r.esCorrecta === true).map((r) => r.id)
  );
  const totalCorrectas = correctIds.size;
  if (totalCorrectas === 0) return 0;

  const selectedSet = new Set(respuestasSeleccionadas);
  const acertadas = [...selectedSet].filter((id) => correctIds.has(id)).length;
  const incorrectasMarcadas = [...selectedSet].filter((id) => !correctIds.has(id)).length;

  const puntosBase = (acertadas / totalCorrectas) * puntosPregunta;
  const penalidad = incorrectasMarcadas * (puntosPregunta / totalOpciones);

  return roundPuntos(Math.max(0, puntosBase - penalidad));
};

export type PreguntaExamenSnapshot = {
  id: string;
  texto: string;
  puntos: number;
  tipoPregunta: TipoPregunta;
  imagenUrl?: string;
  imagenPath?: string;
  respuestas: Array<{
    id: string;
    texto: string;
    esCorrecta: boolean;
  }>;
};

export const buildPreguntasSnapshot = (
  preguntas: Array<ExamenPregunta & { puntos?: number }>
): PreguntaExamenSnapshot[] => {
  const total = preguntas.length;
  return preguntas.map((pregunta, index) => {
    const imagenUrl =
      typeof pregunta.imagenUrl === "string" && pregunta.imagenUrl.trim()
        ? pregunta.imagenUrl.trim()
        : undefined;
    const imagenPath =
      typeof pregunta.imagenPath === "string" && pregunta.imagenPath.trim()
        ? pregunta.imagenPath.trim()
        : undefined;
    return {
      id: pregunta.id,
      texto: pregunta.texto,
      puntos: getPreguntaPuntos(pregunta, index, total),
      tipoPregunta: resolveTipoPregunta(pregunta),
      ...(imagenUrl ? { imagenUrl } : {}),
      ...(imagenPath ? { imagenPath } : {}),
      respuestas: esPreguntaDesarrollo(pregunta)
        ? []
        : (pregunta.respuestas || []).map((r) => ({
            id: r.id,
            texto: r.texto,
            esCorrecta: r.esCorrecta === true,
          })),
    };
  });
};

export type PreguntaExamenRealizadoGuardada = PreguntaExamenSnapshot & {
  puntosObtenidos: number;
  acertada: boolean;
  esCorrecta: boolean;
  respuestasSeleccionadas: string[];
  respuestaDesarrollo?: string;
};

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
    const acertada = desarrollo
      ? false
      : isQuestionCorrect(pregunta, seleccionadas);
    const imagenUrl =
      typeof pregunta.imagenUrl === "string" && pregunta.imagenUrl.trim()
        ? pregunta.imagenUrl.trim()
        : undefined;
    const imagenPath =
      typeof pregunta.imagenPath === "string" && pregunta.imagenPath.trim()
        ? pregunta.imagenPath.trim()
        : undefined;
    return {
      id: pregunta.id,
      texto: pregunta.texto,
      puntos,
      tipoPregunta: resolveTipoPregunta(pregunta),
      ...(imagenUrl ? { imagenUrl } : {}),
      ...(imagenPath ? { imagenPath } : {}),
      puntosObtenidos: desarrollo ? 0 : getQuestionFractionalPoints(pregunta, seleccionadas, puntos),
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
  respuestasAlumno: RespuestaAlumno[],
  notaMinimaAprobacion: number = PORCENTAJE_MINIMO_APROBACION
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
    if (esPreguntaDesarrollo(pregunta)) return;

    const puntosPregunta = getPreguntaPuntos(pregunta, index, totalPreguntas);
    const respuesta = respuestasAlumno.find((r) => r.idPregunta === pregunta.id);
    const seleccionadas = respuesta?.respuestasSeleccionadas ?? [];
    const puntosGanados = getQuestionFractionalPoints(pregunta, seleccionadas, puntosPregunta);
    if (isQuestionCorrect(pregunta, seleccionadas)) {
      respuestasCorrectas++;
    }
    puntosObtenidos += puntosGanados;
  });

  const grade = computeGradeFromPuntosObtenidos(puntosObtenidos, notaMinimaAprobacion);

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
