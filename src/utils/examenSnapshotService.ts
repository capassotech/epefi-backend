import { firestore } from "../config/firebase";
import {
  buildPreguntasExamenRealizado,
  buildPreguntasSnapshot,
  ExamenPregunta,
  normalizePreguntasPuntos,
  RespuestaAlumno,
} from "./examenScoring";

const examenesCollection = firestore.collection("examenes");
const examenesRealizadosCollection = firestore.collection("examenes_realizados");

export const intentoTieneSnapshot = (record: Record<string, unknown>): boolean => {
  const preguntas = record.preguntas;
  if (Array.isArray(preguntas) && preguntas.length > 0) {
    const usable = preguntas.some((p: any) => {
      if (p?.tipoPregunta === "desarrollo") return true;
      if (typeof p?.respuestaDesarrollo === "string") return true;
      const respuestas = p?.respuestas ?? p?.opciones;
      return Array.isArray(respuestas) && respuestas.length > 0;
    });
    if (usable) return true;
  }

  const snapshot = record.preguntasSnapshot;
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot.some((p: any) => {
      if (p?.tipoPregunta === "desarrollo") return true;
      return Array.isArray(p?.respuestas) && p.respuestas.length > 0;
    });
  }

  return false;
};

const normalizePreguntasForStorage = (
  preguntasRaw: ExamenPregunta[]
): ExamenPregunta[] => {
  try {
    return normalizePreguntasPuntos(preguntasRaw);
  } catch {
    return preguntasRaw;
  }
};

/** Guarda una versión del examen antes de editarlo (para recuperar intentos legacy). */
export const saveExamenPreguntasVersion = async (
  examenId: string,
  preguntas: ExamenPregunta[]
): Promise<void> => {
  if (!examenId || !Array.isArray(preguntas) || preguntas.length === 0) return;

  await examenesCollection
    .doc(examenId)
    .collection("versiones")
    .add({
      fecha: new Date(),
      preguntas: normalizePreguntasForStorage(preguntas),
    });
};

/**
 * Busca en el historial de versiones una copia que contenga todas las
 * preguntas respondidas en el intento.
 */
export const findPreguntasFromExamenHistorial = async (
  examenId: string,
  answeredIds: string[]
): Promise<ExamenPregunta[] | null> => {
  if (!examenId || answeredIds.length === 0) return null;

  const needed = new Set(answeredIds.map(String));
  const snap = await examenesCollection
    .doc(examenId)
    .collection("versiones")
    .orderBy("fecha", "desc")
    .limit(30)
    .get();

  for (const doc of snap.docs) {
    const preguntas = (doc.data()?.preguntas || []) as ExamenPregunta[];
    const byId = new Map(preguntas.map((p) => [String(p.id), p]));
    const allFound = [...needed].every((id) => byId.has(id));
    if (!allFound) continue;

    return answeredIds
      .map((id) => byId.get(String(id)))
      .filter((p): p is ExamenPregunta => p != null);
  }

  return null;
};

const normalizeRespuestasAlumno = (raw: unknown): RespuestaAlumno[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => {
      const idPregunta = String(
        item?.idPregunta || item?.preguntaId || item?.id || ""
      ).trim();
      let seleccionadas: string[] = [];
      if (Array.isArray(item?.respuestasSeleccionadas)) {
        seleccionadas = item.respuestasSeleccionadas.map((id: unknown) =>
          String(id).trim()
        );
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

/**
 * Antes de editar un examen: congela las preguntas actuales en todos los
 * intentos que todavía no tienen snapshot.
 */
export const backfillSnapshotsForExamen = async (
  examenId: string,
  preguntasActuales: ExamenPregunta[]
): Promise<number> => {
  if (!examenId || !Array.isArray(preguntasActuales) || preguntasActuales.length === 0) {
    return 0;
  }

  const preguntas = normalizePreguntasForStorage(preguntasActuales);
  const snapshot = buildPreguntasSnapshot(preguntas);
  const preguntaIds = new Set(preguntas.map((p) => String(p.id)));

  const intentos = await examenesRealizadosCollection
    .where("idExamen", "==", examenId)
    .get();

  if (intentos.empty) return 0;

  let updated = 0;
  const batchSize = 400;
  let batch = firestore.batch();
  let opsInBatch = 0;

  const commitIfNeeded = async (force = false) => {
    if (opsInBatch === 0) return;
    if (!force && opsInBatch < batchSize) return;
    await batch.commit();
    batch = firestore.batch();
    opsInBatch = 0;
  };

  for (const doc of intentos.docs) {
    const data = doc.data() || {};
    if (intentoTieneSnapshot(data)) continue;

    const respuestas = normalizeRespuestasAlumno(data.respuestas);
    const answeredIds = respuestas.map((r) => r.idPregunta);
    // Solo backfillear si las preguntas actuales todavía contienen las del intento
    const allMatch =
      answeredIds.length > 0 &&
      answeredIds.every((id) => preguntaIds.has(String(id)));
    if (!allMatch) continue;

    const preguntasDetalle = buildPreguntasExamenRealizado(preguntas, respuestas);

    batch.update(doc.ref, {
      preguntasSnapshot: snapshot,
      preguntas: preguntasDetalle,
      snapshotBackfilledAt: new Date(),
    });
    opsInBatch++;
    updated++;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);
  return updated;
};

/**
 * Si el intento aún no tiene snapshot pero las preguntas del examen vivo
 * coinciden con las respondidas, congela esa copia ahora.
 */
export const lazyBackfillIntentoSnapshot = async (
  intentoId: string,
  record: Record<string, unknown>,
  preguntas: ExamenPregunta[],
  respuestas: RespuestaAlumno[]
): Promise<void> => {
  if (intentoTieneSnapshot(record)) return;
  if (!preguntas.length) return;

  const snapshot = buildPreguntasSnapshot(preguntas);
  const preguntasDetalle = buildPreguntasExamenRealizado(preguntas, respuestas);

  await examenesRealizadosCollection.doc(intentoId).update({
    preguntasSnapshot: snapshot,
    preguntas: preguntasDetalle,
    snapshotBackfilledAt: new Date(),
  });
};
