import { firestore } from "../config/firebase";
import {
  getIntentosDefaultExamen,
  isRevisionPermitida,
  MAX_INTENTOS_EXAMEN,
} from "./examenScoring";

const intentosUsuarioCollection = firestore.collection(
  "examenes_intentos_usuario"
);
const revisionUsuarioCollection = firestore.collection(
  "examenes_revision_usuario"
);
const examenesRealizadosCollection = firestore.collection(
  "examenes_realizados"
);
const usersCollection = firestore.collection("users");

export type ExamenIntentosOverride = {
  id: string;
  idAlumno: string;
  idExamen: string;
  idFormacion: string;
  intentosMaximos: number;
  updatedAt?: Date | string;
  updatedBy?: string;
};

export const buildIntentosUsuarioDocId = (
  idAlumno: string,
  idExamen: string
): string => `${idAlumno}__${idExamen}`;

const normalizeIntentosMaximos = (raw: unknown): number | null => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
};

export const resolveIntentosMaximos = async (
  idAlumno: string,
  idExamen: string,
  idFormacion?: string,
  intentosDefault: number = MAX_INTENTOS_EXAMEN
): Promise<number> => {
  if (!idAlumno) return intentosDefault;

  if (idExamen) {
    const doc = await intentosUsuarioCollection
      .doc(buildIntentosUsuarioDocId(idAlumno, idExamen))
      .get();

    if (doc.exists) {
      const normalized = normalizeIntentosMaximos(doc.data()?.intentosMaximos);
      if (normalized != null) return normalized;
    }
  }

  // Fallback: si hay varios exámenes en la formación, usar el override del alumno
  // aunque el endpoint de estado haya elegido otro documento de examen.
  if (idFormacion) {
    const snap = await intentosUsuarioCollection
      .where("idAlumno", "==", idAlumno)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (String(data.idFormacion || "").trim() !== idFormacion) continue;
      const normalized = normalizeIntentosMaximos(data.intentosMaximos);
      if (normalized != null) return normalized;
    }
  }

  return intentosDefault;
};

/** Examen de la formación con override personalizado para el alumno, si existe. */
export const findOverrideExamenIdForFormacion = async (
  idAlumno: string,
  idFormacion: string
): Promise<string | null> => {
  if (!idAlumno || !idFormacion) return null;

  const snap = await intentosUsuarioCollection
    .where("idAlumno", "==", idAlumno)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (String(data.idFormacion || "").trim() !== idFormacion) continue;
    const idExamen = String(data.idExamen || "").trim();
    const normalized = normalizeIntentosMaximos(data.intentosMaximos);
    if (idExamen && normalized != null) return idExamen;
  }

  return null;
};

export const countIntentosUsados = async (
  idAlumno: string,
  idExamen: string
): Promise<number> => {
  const snap = await examenesRealizadosCollection
    .where("idAlumno", "==", idAlumno)
    .where("idExamen", "==", idExamen)
    .get();
  return snap.size;
};

export const upsertIntentosMaximosAlumno = async (params: {
  idAlumno: string;
  idExamen: string;
  idFormacion: string;
  intentosMaximos: number;
  updatedBy: string;
}): Promise<ExamenIntentosOverride> => {
  const intentosMaximos = Math.floor(Number(params.intentosMaximos));
  if (!Number.isFinite(intentosMaximos) || intentosMaximos < 1) {
    throw new Error("Los intentos máximos deben ser un entero mayor o igual a 1");
  }

  const usados = await countIntentosUsados(params.idAlumno, params.idExamen);
  if (intentosMaximos < usados) {
    throw new Error(
      `No podés asignar menos de ${usados} intentos: el alumno ya usó ${usados}`
    );
  }

  const id = buildIntentosUsuarioDocId(params.idAlumno, params.idExamen);
  const payload = {
    idAlumno: params.idAlumno,
    idExamen: params.idExamen,
    idFormacion: params.idFormacion,
    intentosMaximos,
    updatedAt: new Date(),
    updatedBy: params.updatedBy,
  };

  await intentosUsuarioCollection.doc(id).set(payload, { merge: true });
  return { id, ...payload };
};

export const deleteIntentosOverride = async (
  idAlumno: string,
  idExamen: string
): Promise<void> => {
  await intentosUsuarioCollection
    .doc(buildIntentosUsuarioDocId(idAlumno, idExamen))
    .delete();
};

// ---------- Revisión del examen ----------

/** Excepción manual: el admin habilitó la revisión a este alumno. */
export const isRevisionHabilitadaAlumno = async (
  idAlumno: string,
  idExamen: string
): Promise<boolean> => {
  const doc = await revisionUsuarioCollection
    .doc(buildIntentosUsuarioDocId(idAlumno, idExamen))
    .get();
  return doc.exists && doc.data()?.habilitada === true;
};

export const setRevisionHabilitadaAlumno = async (params: {
  idAlumno: string;
  idExamen: string;
  idFormacion: string;
  habilitada: boolean;
  updatedBy: string;
}): Promise<void> => {
  const ref = revisionUsuarioCollection.doc(
    buildIntentosUsuarioDocId(params.idAlumno, params.idExamen)
  );
  if (!params.habilitada) {
    await ref.delete();
    return;
  }
  await ref.set({
    idAlumno: params.idAlumno,
    idExamen: params.idExamen,
    idFormacion: params.idFormacion,
    habilitada: true,
    updatedAt: new Date(),
    updatedBy: params.updatedBy,
  });
};

/**
 * El alumno puede revisar si el admin se lo habilitó manualmente, o si el examen
 * permite revisión y el alumno aprobó o agotó sus intentos (así no conoce las
 * respuestas mientras pueda volver a rendir).
 */
export const puedeRevisarExamen = (params: {
  examenData: { permitirRevision?: boolean } | null | undefined;
  aprobado: boolean;
  intentosUsados: number;
  intentosMaximos: number;
  revisionHabilitadaAlumno: boolean;
}): boolean =>
  params.revisionHabilitadaAlumno ||
  (isRevisionPermitida(params.examenData) &&
    (params.aprobado || params.intentosUsados >= params.intentosMaximos));

/** Resuelve todo lo necesario para `puedeRevisarExamen` a partir de Firestore. */
export const resolvePuedeRevisarExamen = async (
  idAlumno: string,
  idExamen: string,
  examenData: Record<string, any> | null | undefined
): Promise<boolean> => {
  const idFormacion = String(examenData?.idFormacion || "").trim() || undefined;
  const [intentosSnap, intentosMaximos, revisionHabilitadaAlumno] =
    await Promise.all([
      examenesRealizadosCollection
        .where("idAlumno", "==", idAlumno)
        .where("idExamen", "==", idExamen)
        .get(),
      resolveIntentosMaximos(
        idAlumno,
        idExamen,
        idFormacion,
        getIntentosDefaultExamen(examenData)
      ),
      isRevisionHabilitadaAlumno(idAlumno, idExamen),
    ]);

  return puedeRevisarExamen({
    examenData,
    aprobado: intentosSnap.docs.some((doc) => doc.data()?.aprobado === true),
    intentosUsados: intentosSnap.size,
    intentosMaximos,
    revisionHabilitadaAlumno,
  });
};

export type AlumnoIntentosRow = {
  idAlumno: string;
  nombreAlumno: string;
  emailAlumno: string;
  intentosUsados: number;
  intentosMaximos: number;
  esOverride: boolean;
  intentosDefault: number;
  revisionHabilitada: boolean;
};

/**
 * Lista alumnos de la formación del examen con intentos usados y límite vigente.
 */
export const listAlumnosIntentosParaExamen = async (params: {
  idExamen: string;
  idFormacion: string;
  intentosDefault: number;
  search?: string;
}): Promise<AlumnoIntentosRow[]> => {
  const [usersSnap, overridesSnap, intentosSnap, revisionSnap] =
    await Promise.all([
      usersCollection
        .where("cursos_asignados", "array-contains", params.idFormacion)
        .get(),
      intentosUsuarioCollection
        .where("idExamen", "==", params.idExamen)
        .get(),
      examenesRealizadosCollection
        .where("idExamen", "==", params.idExamen)
        .get(),
      revisionUsuarioCollection
        .where("idExamen", "==", params.idExamen)
        .get(),
    ]);

  const revisionHabilitadaPorAlumno = new Set(
    revisionSnap.docs
      .filter((doc) => doc.data()?.habilitada === true)
      .map((doc) => String(doc.data()?.idAlumno || "").trim())
  );

  const overridesByAlumno = new Map<string, number>();
  for (const doc of overridesSnap.docs) {
    const data = doc.data() || {};
    const idAlumno = String(data.idAlumno || "").trim();
    const max = Number(data.intentosMaximos);
    if (idAlumno && Number.isFinite(max) && max >= 1) {
      overridesByAlumno.set(idAlumno, Math.floor(max));
    }
  }

  const usadosByAlumno = new Map<string, number>();
  for (const doc of intentosSnap.docs) {
    const idAlumno = String(doc.data()?.idAlumno || "").trim();
    if (!idAlumno) continue;
    usadosByAlumno.set(idAlumno, (usadosByAlumno.get(idAlumno) || 0) + 1);
  }

  const search = (params.search || "").trim().toLowerCase();

  const rows: AlumnoIntentosRow[] = usersSnap.docs
    .map((doc) => {
      const data = doc.data() || {};
      const nombre = `${data.nombre || ""} ${data.apellido || ""}`.trim();
      const email = String(data.email || "");
      const idAlumno = doc.id;
      const override = overridesByAlumno.get(idAlumno);
      const intentosMaximos = override ?? params.intentosDefault;

      return {
        idAlumno,
        nombreAlumno: nombre || "Sin nombre",
        emailAlumno: email,
        intentosUsados: usadosByAlumno.get(idAlumno) || 0,
        intentosMaximos,
        esOverride: override != null,
        intentosDefault: params.intentosDefault,
        revisionHabilitada: revisionHabilitadaPorAlumno.has(idAlumno),
      };
    })
    .filter((row) => {
      if (!search) return true;
      return (
        row.nombreAlumno.toLowerCase().includes(search) ||
        row.emailAlumno.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => a.nombreAlumno.localeCompare(b.nombreAlumno, "es"));

  return rows;
};
