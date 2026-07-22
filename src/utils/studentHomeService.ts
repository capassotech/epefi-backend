import { firestore } from "../config/firebase";
import { formatFirestoreDoc } from "./utils";
import { getModuleContentKeys } from "./formacionProgress";

const cursosCollection = firestore.collection("cursos");
const materiasCollection = firestore.collection("materias");
const modulosCollection = firestore.collection("modulos");

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
};

const pickCourseForHome = (
  course: Record<string, unknown>
): Omit<
  StudentHomeCourse,
  "progresoPorcentaje" | "progresoCompletados" | "progresoTotal"
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

export const buildStudentHomeCourses = async (
  cursosAsignados: string[],
  progreso: Record<string, Record<string, boolean>>,
  modulosHabilitados: Record<string, boolean>
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

  const homeCourses: StudentHomeCourse[] = [];

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

    homeCourses.push({
      ...pickCourseForHome(formatFirestoreDoc(courseDoc)),
      progresoPorcentaje: contentProgress.percentage,
      progresoCompletados: contentProgress.completed,
      progresoTotal: contentProgress.total,
    });
  }

  return homeCourses;
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

      // Un módulo deshabilitado nunca se devuelve al alumno
      if (!enabled) continue;

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
