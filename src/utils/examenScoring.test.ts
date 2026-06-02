import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateExamenGrade,
  ExamenPregunta,
  PORCENTAJE_MINIMO_APROBACION,
  RespuestaAlumno,
} from "./examenScoring";

const buildExamenFixture = (
  totalPreguntas: number,
  respuestasCorrectas: number
): { preguntas: ExamenPregunta[]; respuestas: RespuestaAlumno[] } => {
  const preguntas: ExamenPregunta[] = [];
  const respuestas: RespuestaAlumno[] = [];

  for (let i = 0; i < totalPreguntas; i++) {
    const idPregunta = `p${i}`;
    const idCorrecta = `${idPregunta}-ok`;
    const idIncorrecta = `${idPregunta}-bad`;

    preguntas.push({
      id: idPregunta,
      texto: `Pregunta ${i + 1}`,
      respuestas: [
        { id: idCorrecta, texto: "Correcta", esCorrecta: true },
        { id: idIncorrecta, texto: "Incorrecta", esCorrecta: false },
      ],
    });

    const esCorrecta = i < respuestasCorrectas;
    respuestas.push({
      idPregunta,
      respuestasSeleccionadas: esCorrecta ? [idCorrecta] : [idIncorrecta],
    });
  }

  return { preguntas, respuestas };
};

describe("calculateExamenGrade", () => {
  it("8 preguntas, 8 correctas → 100%, nota 10, aprobado", () => {
    const { preguntas, respuestas } = buildExamenFixture(8, 8);
    const result = calculateExamenGrade(preguntas, respuestas);

    assert.equal(result.totalPreguntas, 8);
    assert.equal(result.respuestasCorrectas, 8);
    assert.equal(result.porcentajeAciertos, 100);
    assert.equal(result.nota, 10);
    assert.equal(result.aprobado, true);
  });

  it("8 preguntas, 6 correctas → 75%, nota 7.5, aprobado", () => {
    const { preguntas, respuestas } = buildExamenFixture(8, 6);
    const result = calculateExamenGrade(preguntas, respuestas);

    assert.equal(result.totalPreguntas, 8);
    assert.equal(result.respuestasCorrectas, 6);
    assert.equal(result.porcentajeAciertos, 75);
    assert.equal(result.nota, 7.5);
    assert.equal(result.aprobado, true);
  });

  it("8 preguntas, 5 correctas → 62.5%, nota 6.3, no aprobado", () => {
    const { preguntas, respuestas } = buildExamenFixture(8, 5);
    const result = calculateExamenGrade(preguntas, respuestas);

    assert.equal(result.totalPreguntas, 8);
    assert.equal(result.respuestasCorrectas, 5);
    assert.equal(result.porcentajeAciertos, 62.5);
    assert.equal(result.nota, 6.3);
    assert.equal(result.aprobado, false);
  });

  it("aprueba exactamente con 70% de aciertos", () => {
    const { preguntas, respuestas } = buildExamenFixture(10, 7);
    const result = calculateExamenGrade(preguntas, respuestas);

    assert.equal(result.porcentajeAciertos, 70);
    assert.equal(result.nota, 7);
    assert.equal(result.aprobado, true);
    assert.equal(PORCENTAJE_MINIMO_APROBACION, 70);
  });

  it("no aprueba con 69.9% de aciertos (7/10 redondeado)", () => {
    const preguntas: ExamenPregunta[] = [];
    const respuestas: RespuestaAlumno[] = [];

    for (let i = 0; i < 10; i++) {
      const idPregunta = `p${i}`;
      preguntas.push({
        id: idPregunta,
        texto: `Pregunta ${i}`,
        respuestas: [
          { id: `${idPregunta}-ok`, texto: "ok", esCorrecta: true },
          { id: `${idPregunta}-bad`, texto: "bad", esCorrecta: false },
        ],
      });
      respuestas.push({
        idPregunta,
        respuestasSeleccionadas:
          i < 6 ? [`${idPregunta}-ok`] : [`${idPregunta}-bad`],
      });
    }

    const result = calculateExamenGrade(preguntas, respuestas);
    assert.equal(result.respuestasCorrectas, 6);
    assert.equal(result.porcentajeAciertos, 60);
    assert.equal(result.aprobado, false);
  });

  it("examen sin preguntas evita división por cero", () => {
    const result = calculateExamenGrade([], []);

    assert.equal(result.totalPreguntas, 0);
    assert.equal(result.respuestasCorrectas, 0);
    assert.equal(result.porcentajeAciertos, 0);
    assert.equal(result.nota, 0);
    assert.equal(result.aprobado, false);
  });

  it("funciona con distinta cantidad de preguntas (15 preguntas, 12 correctas)", () => {
    const { preguntas, respuestas } = buildExamenFixture(15, 12);
    const result = calculateExamenGrade(preguntas, respuestas);

    assert.equal(result.totalPreguntas, 15);
    assert.equal(result.respuestasCorrectas, 12);
    assert.equal(result.porcentajeAciertos, 80);
    assert.equal(result.nota, 8);
    assert.equal(result.aprobado, true);
  });
});
