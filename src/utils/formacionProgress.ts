import { firestore } from "../config/firebase";
import { cached } from "./shortCache";

const cursosCollection = firestore.collection("cursos");
const materiasCollection = firestore.collection("materias");
const modulosCollection = firestore.collection("modulos");

export interface ModuleContentKey {
  key: string;
  contentType: "video" | "document";
  index: number;
}

export interface FormationProgressResult {
  completo: boolean;
  totalModulos: number;
  modulosCompletados: number;
  modulosPendientes: string[];
}

export const getModuleContentKeys = (
  moduleId: string,
  moduleData: Record<string, unknown>
): ModuleContentKey[] => {
  const keys: ModuleContentKey[] = [];

  const videos = Array.isArray(moduleData.url_video)
    ? moduleData.url_video
    : typeof moduleData.url_video === "string" && moduleData.url_video.trim()
      ? [moduleData.url_video]
      : [];
  videos.forEach((_, index) => {
    keys.push({
      key: `${moduleId}_video_${index}`,
      contentType: "video",
      index,
    });
  });

  const hasDocument =
    typeof moduleData.url_archivo === "string" &&
    moduleData.url_archivo.trim() !== "";

  if (hasDocument) {
    let documentCount = 1;
    const urlArchivo = moduleData.url_archivo as string;
    if (typeof moduleData.nombres_archivos === "string") {
      const names = moduleData.nombres_archivos
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      if (names.length > 0) {
        documentCount = names.length;
      } else {
        const byPipe = moduleData.nombres_archivos
          .split("|||")
          .map((n) => n.trim())
          .filter(Boolean);
        if (byPipe.length > 0) documentCount = byPipe.length;
      }
    } else if (urlArchivo.includes("|||")) {
      documentCount = urlArchivo.split("|||").filter((url) => url.trim()).length;
    }

    for (let index = 0; index < documentCount; index++) {
      keys.push({
        key: `${moduleId}_document_${index}`,
        contentType: "document",
        index,
      });
    }
  }

  return keys;
};

export const isModuleContentCompleted = (
  moduleId: string,
  moduleData: Record<string, unknown>,
  moduleProgreso: Record<string, boolean> | undefined
): boolean => {
  if (!moduleProgreso) {
    const requiredKeys = getModuleContentKeys(moduleId, moduleData);
    return requiredKeys.length === 0;
  }

  const prefix = `${moduleId}_`;
  const trackedKeys = Object.keys(moduleProgreso).filter((key) =>
    key.startsWith(prefix)
  );

  // Priorizar el progreso real registrado por la app (videos/documentos vistos)
  if (trackedKeys.length > 0) {
    return trackedKeys.every((key) => moduleProgreso[key] === true);
  }

  const requiredKeys = getModuleContentKeys(moduleId, moduleData);
  if (requiredKeys.length === 0) return true;

  return requiredKeys.every((item) => moduleProgreso[item.key] === true);
};

export const getFormationModuleIds = async (
  idFormacion: string
): Promise<string[]> => {
  const cursoDoc = await cursosCollection.doc(idFormacion).get();
  if (!cursoDoc.exists) return [];

  const materiaIds: string[] = cursoDoc.data()?.materias || [];
  if (materiaIds.length === 0) return [];

  const materiaDocs = await Promise.all(
    materiaIds.map((id) => materiasCollection.doc(id).get())
  );

  const moduleIds = new Set<string>();
  for (const materiaDoc of materiaDocs) {
    if (!materiaDoc.exists) continue;
    const modulos: string[] = materiaDoc.data()?.modulos || [];
    modulos.forEach((moduleId) => moduleIds.add(moduleId));
  }

  return [...moduleIds];
};

interface CursoEstructura {
  materias: Array<{ id: string; modulos: string[]; estados: Map<string, boolean> }>;
  modulos: Map<string, Record<string, unknown>>;
}

const ESTRUCTURA_TTL_MS = 30_000;

/**
 * Materias, módulos y estado global de un curso. Es igual para todos los alumnos, así que se
 * comparte durante unos segundos: si no, 300 alumnos repiten las mismas lecturas por cada pedido.
 */
const getCursoEstructura = (idFormacion: string): Promise<CursoEstructura> =>
  cached(`curso-estructura:${idFormacion}`, ESTRUCTURA_TTL_MS, async () => {
    const cursoDoc = await cursosCollection.doc(idFormacion).get();
    const materiaIds: string[] = cursoDoc.data()?.materias || [];

    const leidas = await Promise.all(
      materiaIds.map(async (id) => {
        const materiaRef = materiasCollection.doc(id);
        const [materiaDoc, estadosSnap] = await Promise.all([
          materiaRef.get(),
          materiaRef.collection("modulos_estado").get(),
        ]);
        if (!materiaDoc.exists) return null;
        const modulos: string[] = materiaDoc.data()?.modulos || [];
        const estados = new Map(
          estadosSnap.docs.map((doc) => [doc.id, doc.data()?.enabledGlobal === true])
        );
        return { id, modulos, estados };
      })
    );
    const materias = leidas.filter((m): m is NonNullable<typeof m> => m !== null);

    const moduleIds = [...new Set(materias.flatMap((m) => m.modulos))];
    const moduleDocs = moduleIds.length
      ? await firestore.getAll(...moduleIds.map((id) => modulosCollection.doc(id)))
      : [];
    const modulos = new Map(
      moduleDocs
        .filter((doc) => doc.exists)
        .map((doc) => [doc.id, doc.data() as Record<string, unknown>])
    );

    return { materias, modulos };
  });

export const getEnabledFormationModules = async (
  idFormacion: string,
  overrides: Record<string, boolean> = {}
): Promise<Array<{ moduleId: string; materiaId: string }>> => {
  const { materias } = await getCursoEstructura(idFormacion);
  const enabledModules: Array<{ moduleId: string; materiaId: string }> = [];

  for (const materia of materias) {
    for (const moduleId of materia.modulos) {
      const enabled =
        moduleId in overrides
          ? overrides[moduleId] === true
          : materia.estados.has(moduleId)
            ? materia.estados.get(moduleId) === true
            : materia.modulos[0] === moduleId;
      if (enabled) {
        enabledModules.push({ moduleId, materiaId: materia.id });
      }
    }
  }

  return enabledModules;
};

export const getFormationProgress = async (
  idFormacion: string,
  progreso: Record<string, Record<string, boolean>> = {},
  modulosHabilitadosOverrides: Record<string, boolean> = {}
): Promise<FormationProgressResult> => {
  const enabledModules = await getEnabledFormationModules(
    idFormacion,
    modulosHabilitadosOverrides
  );

  if (enabledModules.length === 0) {
    return {
      completo: true,
      totalModulos: 0,
      modulosCompletados: 0,
      modulosPendientes: [],
    };
  }

  const { modulos } = await getCursoEstructura(idFormacion);

  const pendientes: string[] = [];
  let completados = 0;
  let totalModulos = 0;

  for (const { moduleId } of enabledModules) {
    const moduleData = modulos.get(moduleId);

    // Referencia en materia sin documento en Firestore: no bloquear la formación
    if (!moduleData) {
      continue;
    }

    totalModulos++;
    const moduleProgreso = progreso[moduleId];

    if (isModuleContentCompleted(moduleId, moduleData, moduleProgreso)) {
      completados++;
    } else {
      pendientes.push(moduleId);
    }
  }

  return {
    completo: totalModulos > 0 && pendientes.length === 0,
    totalModulos,
    modulosCompletados: completados,
    modulosPendientes: pendientes,
  };
};

export interface FormationContentProgressResult {
  completed: number;
  total: number;
  percentage: number;
  tieneModulosVisibles: boolean;
}

/** Progreso por ítems de contenido (videos + documentos), igual que la barra del home. */
export const getFormationContentProgress = async (
  idFormacion: string,
  progreso: Record<string, Record<string, boolean>> = {},
  modulosHabilitadosOverrides: Record<string, boolean> = {}
): Promise<FormationContentProgressResult> => {
  const enabledModules = await getEnabledFormationModules(
    idFormacion,
    modulosHabilitadosOverrides
  );

  if (enabledModules.length === 0) {
    const moduleIds = await getFormationModuleIds(idFormacion);
    return {
      completed: 0,
      total: 0,
      percentage: 0,
      tieneModulosVisibles: moduleIds.length === 0,
    };
  }

  const { modulos } = await getCursoEstructura(idFormacion);

  let completed = 0;
  let total = 0;

  for (const { moduleId } of enabledModules) {
    const moduleData = modulos.get(moduleId);
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
    tieneModulosVisibles: true,
  };
};

export const studentHasFormationAssigned = (
  cursosAsignados: string[] | undefined,
  idFormacion: string
): boolean => {
  return Array.isArray(cursosAsignados) && cursosAsignados.includes(idFormacion);
};
