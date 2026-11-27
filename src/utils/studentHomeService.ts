import { firestore } from "../config/firebase";
import { formatFirestoreDoc } from "./utils";
import { getModuleContentKeys, isModuleContentCompleted } from "./formacionProgress";
import { getExamenesDeFormacionCached } from "./examenCache";
import { getIntentosDefaultExamen, isExamenHabilitado } from "./examenScoring";

const cursosCollection = firestore.collection("cursos");
const materiasCollection = firestore.collection("materias");
const modulosCollection = firestore.collection("modulos");
const examenesRealizadosCollection = firestore.collection("examenes_realizados");
const intentosUsuarioCollection = firestore.collection("examenes_intentos_usuario");

export type StudentHomeCourse = {
  id: string;
  titulo: string;
  descripcion: string;
  imagen: string;
  estado: string;
  fechaInicioDictado: unknown;
  fechaFinDictado: unknown;
  progresoPorcentaje: number;
  progresoCompletados: number;
  progresoTotal: number;
  /** Hay un examen del curso que el alumno puede rendir ahora. */
  examenParaRendir: boolean;
};

const pickCourseForHome = (
  course: Record<string, unknown>
): Omit<
  StudentHomeCourse,
  "progresoPorcentaje" | "progresoCompletados" | "progresoTotal" | "examenParaRendir"
> => ({
  id: String(course.id ?? ""),
  titulo: String(course.titulo ?? ""),
  descripcion: String(course.descripcion ?? ""),
  imagen: String(course.imagen ?? ""),
  estado: String(course.estado ?? "activo"),
  fechaInicioDictado: course.fechaInicioDictado ?? null,
  fechaFinDictado: course.fechaFinDictado ?? null,
});

const resolveModuleEnabledSync = (
  moduleId: string,
  materiaId: string,
  modulos: string[],
  overrides: Record<string, boolean>,
  estadoGlobalByKey: Map<string, boolean>
): boolean => {
  if (moduleId in overrides) {
    return overrides[moduleId] === true;
  }

  const estadoKey = `${materiaId}:${moduleId}`;
  if (estadoGlobalByKey.has(estadoKey)) {
    return estadoGlobalByKey.get(estadoKey) === true;
  }

  return modulos[0] === moduleId;
};

const computeContentProgress = (
  enabledModuleIds: string[],
  modulosById: Map<string, Record<string, unknown>>,
  progreso: Record<string, Record<string, boolean>>
): { completed: number; total: number; percentage: number } => {
  let completed = 0;
  let total = 0;

  for (const moduleId of enabledModuleIds) {
    const moduleData = modulosById.get(moduleId);
    if (!moduleData) continue;

    const moduleProgreso = progreso[moduleId];
    const contentKeys = getModuleContentKeys(moduleId, moduleData);

    for (const item of contentKeys) {
      total++;
      if (moduleProgreso?.[item.key] === true) {
        completed++;
      }
    }
  }

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
};

const normalizeIntentosMaximos = (raw: unknown): number | null => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return null;
  return Math.floor(value);
};

const toMillis = (value: unknown): number => {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const time = new Date(value as string | number | Date).getTime();
  return Number.isNaN(time) ? 0 : time;
};

/**
 * Cursos con algún examen que el alumno puede rendir ahora. Usa la misma regla que `puedeRealizar`
 * del estado del examen, pero con dos lecturas por alumno en vez de varias por cada examen.
 */
const getCursosConExamenParaRendir = async (
  uid: string,
  cursos: Array<{ id: string; formacionCompleta: boolean }>
): Promise<Set<string>> => {
  const resultado = new Set<string>();
  const examenesPorCurso = await Promise.all(
    cursos.map((curso) => getExamenesDeFormacionCached(curso.id))
  );
  if (examenesPorCurso.every((docs) => docs.length === 0)) return resultado;

  const [intentosSnap, overridesSnap] = await Promise.all([
    examenesRealizadosCollection
      .where("idAlumno", "==", uid)
      .select("idExamen", "aprobado", "estado", "fechaRealizacion")
      .get(),
    intentosUsuarioCollection.where("idAlumno", "==", uid).get(),
  ]);

  const intentosPorExamen = new Map<string, { total: number; ultimo: FirebaseFirestore.DocumentData }>();
  for (const doc of intentosSnap.docs) {
    const data = doc.data();
    const idExamen = String(data.idExamen || "");
    const actual = intentosPorExamen.get(idExamen);
    if (!actual) {
      intentosPorExamen.set(idExamen, { total: 1, ultimo: data });
      continue;
    }
    actual.total++;
    if (toMillis(data.fechaRealizacion) > toMillis(actual.ultimo.fechaRealizacion)) actual.ultimo = data;
  }

  // Igual que resolveIntentosMaximos: primero el del examen, después cualquiera del curso
  const overridePorExamen = new Map<string, number>();
  const overridePorCurso = new Map<string, number>();
  for (const doc of overridesSnap.docs) {
    const data = doc.data() || {};
    const max = normalizeIntentosMaximos(data.intentosMaximos);
    if (max == null) continue;
    if (doc.id === `${uid}__${String(data.idExamen || "")}`) overridePorExamen.set(String(data.idExamen), max);
    const idFormacion = String(data.idFormacion || "").trim();
    if (idFormacion && !overridePorCurso.has(idFormacion)) overridePorCurso.set(idFormacion, max);
  }

  cursos.forEach((curso, index) => {
    const puedeRendirAlguno = examenesPorCurso[index].some((examenDoc) => {
      const examenData = examenDoc.data();
      if (!isExamenHabilitado(examenData)) return false;

      const intentos = intentosPorExamen.get(examenDoc.id);
      const ultimo = intentos?.ultimo;
      const yaAprobo = ultimo?.aprobado === true;
      const pendienteCorreccion = ultimo?.estado === "pendiente_correccion";
      if (yaAprobo || pendienteCorreccion) return false;

      const intentosMaximos =
        overridePorExamen.get(examenDoc.id) ??
        overridePorCurso.get(curso.id) ??
        getIntentosDefaultExamen(examenData);
      if ((intentos?.total ?? 0) >= intentosMaximos) return false;

      const requiereCompletarCurso = examenData?.requiereCompletarCurso !== false;
      return curso.formacionCompleta || ultimo !== undefined || !requiereCompletarCurso;
    });
    if (puedeRendirAlguno) resultado.add(curso.id);
  });

  return resultado;
};

export const buildStudentHomeCourses = async (
  cursosAsignados: string[],
  progreso: Record<string, Record<string, boolean>>,
  modulosHabilitados: Record<string, boolean>,
  uid: string
): Promise<StudentHomeCourse[]> => {
  if (cursosAsignados.length === 0) return [];

  const courseDocs = await Promise.all(
    cursosAsignados.map((courseId) => cursosCollection.doc(courseId).get())
  );

  const activeCourses = courseDocs.filter((doc) => {
    if (!doc.exists) return false;
    const estado = (doc.data()?.estado || "activo").toString().toLowerCase();
    return estado === "activo";
  });

  if (activeCourses.length === 0) return [];

  const materiaIds = [
    ...new Set(
      activeCourses.flatMap((doc) => (doc.data()?.materias as string[]) || [])
    ),
  ];

  const materiaDocs = await Promise.all(
    materiaIds.map((id) => materiasCollection.doc(id).get())
  );

  const materiasById = new Map<string, { modulos: string[] }>();
  const allModuleIds = new Set<string>();

  for (const doc of materiaDocs) {
    if (!doc.exists) continue;
    const modulos: string[] = doc.data()?.modulos || [];
    materiasById.set(doc.id, { modulos });
    modulos.forEach((moduleId) => allModuleIds.add(moduleId));
  }

  const [moduloDocs, ...estadoSnapshots] = await Promise.all([
    Promise.all(
      [...allModuleIds].map((id) => modulosCollection.doc(id).get())
    ),
    ...materiaIds.map((materiaId) =>
      materiasCollection.doc(materiaId).collection("modulos_estado").get()
    ),
  ]);

  const modulosById = new Map<string, Record<string, unknown>>();
  for (const doc of moduloDocs) {
    if (doc.exists) {
      modulosById.set(doc.id, doc.data() as Record<string, unknown>);
    }
  }

  const estadoGlobalByKey = new Map<string, boolean>();
  estadoSnapshots.forEach((snapshot, index) => {
    const materiaId = materiaIds[index];
    snapshot.docs.forEach((doc) => {
      estadoGlobalByKey.set(
        `${materiaId}:${doc.id}`,
        doc.data()?.enabledGlobal === true
      );
    });
  });

  const homeCourses: Omit<StudentHomeCourse, "examenParaRendir">[] = [];
  const formacionCompletaPorCurso = new Map<string, boolean>();

  for (const courseDoc of activeCourses) {
    const courseId = courseDoc.id;
    const courseData = courseDoc.data()!;
    const courseMateriaIds: string[] = courseData.materias || [];
    const courseModuleIds = courseMateriaIds.flatMap(
      (materiaId) => materiasById.get(materiaId)?.modulos ?? []
    );

    if (courseModuleIds.length > 0) {
      const hasEnabled = courseModuleIds.some(
        (moduleId) => modulosHabilitados[moduleId] !== false
      );
      if (!hasEnabled) continue;
    }

    const enabledModuleIds: string[] = [];
    let habilitadosConOSinDoc = 0;
    for (const materiaId of courseMateriaIds) {
      const materia = materiasById.get(materiaId);
      if (!materia) continue;

      for (const moduleId of materia.modulos) {
        const enabled = resolveModuleEnabledSync(
          moduleId,
          materiaId,
          materia.modulos,
          modulosHabilitados,
          estadoGlobalByKey
        );
        if (enabled) habilitadosConOSinDoc++;
        if (enabled && modulosById.has(moduleId)) {
          enabledModuleIds.push(moduleId);
        }
      }
    }

    if (courseModuleIds.length > 0 && enabledModuleIds.length === 0) {
      continue;
    }

    const contentProgress = computeContentProgress(
      enabledModuleIds,
      modulosById,
      progreso
    );

    // Misma regla que getFormationProgress: sin módulos habilitados el curso cuenta como completo
    formacionCompletaPorCurso.set(
      courseId,
      habilitadosConOSinDoc === 0 ||
        (enabledModuleIds.length > 0 &&
          enabledModuleIds.every((moduleId) =>
            isModuleContentCompleted(moduleId, modulosById.get(moduleId)!, progreso[moduleId])
          ))
    );

    homeCourses.push({
      ...pickCourseForHome(formatFirestoreDoc(courseDoc)),
      progresoPorcentaje: contentProgress.percentage,
      progresoCompletados: contentProgress.completed,
      progresoTotal: contentProgress.total,
    });
  }

  // El aviso es un extra: si falla, el inicio se muestra igual, sin el aviso
  let conExamen = new Set<string>();
  try {
    conExamen = await getCursosConExamenParaRendir(
      uid,
      homeCourses.map((course) => ({
        id: course.id,
        formacionCompleta: formacionCompletaPorCurso.get(course.id) === true,
      }))
    );
  } catch (error) {
    console.error("getCursosConExamenParaRendir error:", error);
  }

  return homeCourses.map((course) => ({ ...course, examenParaRendir: conExamen.has(course.id) }));
};

export const fetchStudentCourseContent = async (
  courseId: string,
  userData: Record<string, unknown>
) => {
  const courseDoc = await cursosCollection.doc(courseId).get();
  if (!courseDoc.exists) {
    return null;
  }

  const curso = formatFirestoreDoc(courseDoc);
  const materiaIds: string[] = curso.materias || [];

  const materiaDocs = await Promise.all(
    materiaIds.map((materiaId) => materiasCollection.doc(materiaId).get())
  );

  const materias = materiaDocs
    .filter((doc) => doc.exists)
    .map((doc) => formatFirestoreDoc(doc));

  const allModuleIds = [
    ...new Set(
      materiaDocs.flatMap((doc) =>
        doc.exists ? (doc.data()?.modulos as string[]) || [] : []
      )
    ),
  ];

  const [moduloDocs, ...estadoSnapshots] = await Promise.all([
    Promise.all(
      allModuleIds.map((moduloId) => modulosCollection.doc(moduloId).get())
    ),
    ...materiaIds.map((materiaId) =>
      materiasCollection.doc(materiaId).collection("modulos_estado").get()
    ),
  ]);

  const modulosById = new Map<string, Record<string, unknown>>();
  for (const doc of moduloDocs) {
    if (doc.exists) {
      modulosById.set(
        doc.id,
        formatFirestoreDoc(doc) as Record<string, unknown>
      );
    }
  }

  const estadoGlobalByKey = new Map<string, boolean>();
  estadoSnapshots.forEach((snapshot, index) => {
    const materiaId = materiaIds[index];
    snapshot.docs.forEach((doc) => {
      estadoGlobalByKey.set(
        `${materiaId}:${doc.id}`,
        doc.data()?.enabledGlobal === true
      );
    });
  });

  const overrides =
    (userData.modulos_habilitados as Record<string, boolean>) || {};
  const modulosHabilitadosResueltos: Record<string, boolean> = {};

  const modulos: Record<string, unknown>[] = [];
  for (const materiaDoc of materiaDocs) {
    if (!materiaDoc.exists) continue;
    const materiaId = materiaDoc.id;
    const moduloIds: string[] = materiaDoc.data()?.modulos || [];

    for (const moduloId of moduloIds) {
      const enabled = resolveModuleEnabledSync(
        moduloId,
        materiaId,
        moduloIds,
        overrides,
        estadoGlobalByKey
      );
      modulosHabilitadosResueltos[moduloId] = enabled;

      const modulo = modulosById.get(moduloId);
      if (modulo) {
        modulos.push({ ...modulo, id_materia: materiaId });
      }
    }
  }

  return {
    curso,
    materias,
    modulos,
    progreso:
      (userData.progreso as Record<string, Record<string, boolean>>) || {},
    modulos_habilitados: modulosHabilitadosResueltos,
  };
};
