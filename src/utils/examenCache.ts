import { firestore } from "../config/firebase";
import { cached, invalidateCached } from "./shortCache";

const examenesCollection = firestore.collection("examenes");
const PREFIX = "examen:";
const TTL_MS = 30_000;

export const getExamenDocCached = (idExamen: string) =>
  cached(`${PREFIX}doc:${idExamen}`, TTL_MS, () => examenesCollection.doc(idExamen).get());

export const getExamenesDeFormacionCached = (idFormacion: string) =>
  cached(`${PREFIX}formacion:${idFormacion}`, TTL_MS, async () => {
    const snapshot = await examenesCollection.where("idFormacion", "==", idFormacion).get();
    return snapshot.docs;
  });

/** Llamar después de cualquier cambio en un examen, para que se vea al instante. */
export const invalidateExamenCache = (): void => invalidateCached(PREFIX);
