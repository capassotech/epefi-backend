/** Porcentaje mínimo de aciertos para aprobar (no cantidad fija de respuestas). */
export const PORCENTAJE_MINIMO_APROBACION = 70;

/** @deprecated Usar PORCENTAJE_MINIMO_APROBACION y porcentajeAciertos */
export const NOTA_MINIMA_APROBACION = 7;

export type ExamenPregunta = {
  id: string;
  texto: string;
  respuestas: Array<{
    id: string;
    texto: string;
    esCorrecta: boolean;
  }>;
};

export type RespuestaAlumno = {
  idPregunta: string;
  respuestasSeleccionadas: string[];
};

export type ExamenCalificacionResult = {
  totalPreguntas: number;
  respuestasCorrectas: number;
  porcentajeAciertos: number;
  nota: number;
  aprobado: boolean;
};

export const roundToOneDecimal = (value: number): number =>
  Math.round(value * 10) / 10;

export const getTipoInputForQuestion = (
  respuestas: Array<{ esCorrecta: boolean }>
): "radio" | "checkbox" => {
  const correctas = respuestas.filter((r) => r.esCorrecta === true).length;
  return correctas === 1 ? "radio" : "checkbox";
};

export const mapPreguntaForStudent = (pregunta: ExamenPregunta) => ({
  id: pregunta.id,
  texto: pregunta.texto,
  tipoInput: getTipoInputForQuestion(pregunta.respuestas),
  respuestas: pregunta.respuestas.map(({ id, texto }) => ({ id, texto })),
});

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

export const calculateExamenGrade = (
  preguntas: ExamenPregunta[],
  respuestasAlumno: RespuestaAlumno[]
): ExamenCalificacionResult => {
  const totalPreguntas = preguntas.length;

  if (totalPreguntas === 0) {
    return {
      totalPreguntas: 0,
      respuestasCorrectas: 0,
      porcentajeAciertos: 0,
      nota: 0,
      aprobado: false,
    };
  }

  let respuestasCorrectas = 0;

  for (const pregunta of preguntas) {
    const respuesta = respuestasAlumno.find((r) => r.idPregunta === pregunta.id);
    const seleccionadas = respuesta?.respuestasSeleccionadas ?? [];
    if (isQuestionCorrect(pregunta, seleccionadas)) {
      respuestasCorrectas++;
    }
  }

  const porcentajeAciertos = roundToOneDecimal(
    (respuestasCorrectas / totalPreguntas) * 100
  );
  const nota = roundToOneDecimal((porcentajeAciertos / 100) * 10);
  const aprobado = porcentajeAciertos >= PORCENTAJE_MINIMO_APROBACION;

  return {
    totalPreguntas,
    respuestasCorrectas,
    porcentajeAciertos,
    nota,
    aprobado,
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
