import { firestore } from "../config/firebase";

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

const resolveModuleEnabled = async (
  moduleId: string,
  materiaId: string,
  overrides: Record<string, boolean>
): Promise<boolean> => {
  if (moduleId in overrides) {
    return overrides[moduleId] === true;
  }

  const estadoDoc = await materiasCollection
    .doc(materiaId)
    .collection("modulos_estado")
    .doc(moduleId)
    .get();

  if (estadoDoc.exists) {
    return estadoDoc.data()?.enabledGlobal === true;
  }

  const materiaDoc = await materiasCollection.doc(materiaId).get();
  const modulos: string[] = materiaDoc.data()?.modulos || [];
  return modulos[0] === moduleId;
};

export const getEnabledFormationModules = async (
  idFormacion: string,
  overrides: Record<string, boolean> = {}
): Promise<Array<{ moduleId: string; materiaId: string }>> => {
  const cursoDoc = await cursosCollection.doc(idFormacion).get();
  if (!cursoDoc.exists) return [];

  const materiaIds: string[] = cursoDoc.data()?.materias || [];
  const enabledModules: Array<{ moduleId: string; materiaId: string }> = [];

  for (const materiaId of materiaIds) {
    const materiaDoc = await materiasCollection.doc(materiaId).get();
    if (!materiaDoc.exists) continue;

    const modulos: string[] = materiaDoc.data()?.modulos || [];
    for (const moduleId of modulos) {
      const enabled = await resolveModuleEnabled(moduleId, materiaId, overrides);
      if (enabled) {
        enabledModules.push({ moduleId, materiaId });
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

  const moduleDocs = await Promise.all(
    enabledModules.map(({ moduleId }) =>
      modulosCollection.doc(moduleId).get()
    )
  );

  const pendientes: string[] = [];
  let completados = 0;
  let totalModulos = 0;

  for (let i = 0; i < enabledModules.length; i++) {
    const { moduleId } = enabledModules[i];
    const moduleDoc = moduleDocs[i];

    // Referencia en materia sin documento en Firestore: no bloquear la formación
    if (!moduleDoc.exists) {
      continue;
    }

    totalModulos++;
    const moduleData = moduleDoc.data() as Record<string, unknown>;
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

export const studentHasFormationAssigned = (
  cursosAsignados: string[] | undefined,
  idFormacion: string
): boolean => {
  return Array.isArray(cursosAsignados) && cursosAsignados.includes(idFormacion);
};
