// src/modules/materia/controller.ts
import type { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type {
  ValidatedMateria,
  ValidatedUpdateMateria,
} from "../../types/schemas";
import { validateUser } from "../../utils/utils";
import { FieldValue } from "firebase-admin/firestore";

const materiasCollection = firestore.collection("materias");
const modulosCollection = firestore.collection("modulos");
const cursosCollection = firestore.collection("cursos");

/**
 * Inicializa modulos_estado para los módulos de una materia.
 * Primer módulo → enabledGlobal: true, resto → enabledGlobal: false.
 * No sobrescribe documentos existentes.
 */
async function syncModulosEstado(materiaId: string, modulosIds: string[]): Promise<void> {
  if (modulosIds.length === 0) return;
  const modulosEstadoRef = materiasCollection.doc(materiaId).collection("modulos_estado");
  // Leer todos los docs existentes en paralelo
  const docs = await Promise.all(modulosIds.map((id) => modulosEstadoRef.doc(id).get()));
  // Crear solo los que no existen, en paralelo
  await Promise.all(
    docs.map((doc, i) => {
      if (!doc.exists) {
        return modulosEstadoRef.doc(modulosIds[i]).set({ enabledGlobal: i === 0 });
      }
    })
  );
}

export const getAllMaterias = async (_: Request, res: Response) => {
  try {
    const snapshot = await materiasCollection.get();

    if (snapshot.empty) {
      return res.json([]);
    }

    const materias = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Si no existe el campo activo, asumir que está activo (true) por defecto
        activo: data.activo !== undefined ? data.activo : true,
      };
    });

    return res.json(materias);
  } catch (err) {
    console.error("getAllMaterias error:", err);
    return res.status(500).json({ error: "Error al obtener materias" });
  }
};

export const getMateriaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await materiasCollection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Materia no encontrada" });
    }

    const data = doc.data();
    return res.json({
      id: doc.id,
      ...data,
      activo: data?.activo !== undefined ? data.activo : true,
    });
  } catch (err) {
    console.error("getMateriaById error:", err);
    return res.status(500).json({ error: "Error al obtener materia" });
  }
};

export const createMateria = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const materiaData: ValidatedMateria = req.body;

    // Verificar que el código de materia no exista ya
    const existingMateria = await materiasCollection
      .where("nombre", "==", materiaData.nombre)
      .get();

    if (!existingMateria.empty) {
      return res.status(409).json({
        error: `Ya existe una materia con el nombre "${materiaData.nombre}"`,
      });
    }

    // Verificar que todos los módulos existen (solo si hay módulos)
    if (materiaData.modulos && materiaData.modulos.length > 0) {
      for (const moduloId of materiaData.modulos) {
        const moduloExists = await modulosCollection.doc(moduloId).get();
        if (!moduloExists.exists) {
          return res.status(404).json({
            error: `El módulo con ID "${moduloId}" no existe`,
          });
        }
      }
    }

    if (materiaData.id_cursos && materiaData.id_cursos.length > 0) {
      for (const cursoId of materiaData.id_cursos) {
        const cursoExists = await cursosCollection.doc(cursoId).get();
        if (!cursoExists.exists) {
          return res.status(404).json({
            error: `El curso con ID "${cursoId}" no existe`,
          });
        }
      }
    }


    // Agregar fechas de auditoría y asegurar que activo tenga un valor por defecto
    const materiaWithDates = {
      ...materiaData,
      activo: materiaData.activo !== undefined ? materiaData.activo : true,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    };

    const docRef = await materiasCollection.add(materiaWithDates);

    await syncModulosEstado(docRef.id, materiaData.modulos || []);

    for (const cursoId of materiaData.id_cursos || []) {
      const cursoDoc = await cursosCollection.doc(cursoId).get();

      if (cursoDoc.exists) {
        const cursoData = cursoDoc.data();

        if (cursoData?.materias && Array.isArray(cursoData.materias)) {
          await cursosCollection.doc(cursoId).update({
            materias: FieldValue.arrayUnion(docRef.id)
          });
        }
        else {
          await cursosCollection.doc(cursoId).update({
            materias: [docRef.id]
          });
        }
      }
    }

    return res.status(201).json({
      id: docRef.id,
      message: "Materia creada exitosamente",
      ...materiaWithDates,
    });
  } catch (err) {
    console.error("createMateria error:", err);
    return res.status(500).json({ error: "Error al crear materia" });
  }
};

export const updateMateria = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const { id } = req.params;
    const updateData: ValidatedUpdateMateria = req.body;

    const materiaExists = await materiasCollection.doc(id).get();
    if (!materiaExists.exists) {
      return res.status(404).json({ error: "Materia no encontrada" });
    }

    if (updateData.nombre) {
      const existingMateria = await materiasCollection
        .where("nombre", "==", updateData.nombre)
        .get();

      // Si existe y no es la misma materia que estamos actualizando
      if (!existingMateria.empty && existingMateria.docs[0].id !== id) {
        return res.status(409).json({
          error: `Ya existe una materia con el nombre "${updateData.nombre}"`,
        });
      }
    }

    // Verificar módulos si se están actualizando
    if (updateData.modulos && updateData.modulos.length > 0) {
      for (const moduloId of updateData.modulos) {
        const moduloExists = await modulosCollection.doc(moduloId).get();
        if (!moduloExists.exists) {
          return res.status(404).json({
            error: `El módulo con ID "${moduloId}" no existe`,
          });
        }
      }
    }

    if (updateData.id_cursos && updateData.id_cursos.length > 0) {
      for (const cursoId of updateData.id_cursos) {
        const cursoExists = await cursosCollection.doc(cursoId).get();
        if (!cursoExists.exists) {
          return res.status(404).json({
            error: `El curso con ID "${cursoId}" no existe`,
          });
        }
      }
    }

    const dataToUpdate = {
      ...updateData,
      fechaActualizacion: new Date(),
    };

    await materiasCollection.doc(id).update(dataToUpdate);

    if (updateData.modulos && updateData.modulos.length > 0) {
      await syncModulosEstado(id, updateData.modulos);
    }

    for (const cursoId of updateData.id_cursos || []) {
      const cursoDoc = await cursosCollection.doc(cursoId).get();

      if (cursoDoc.exists) {
        const cursoData = cursoDoc.data();

        if (cursoData?.materias && Array.isArray(cursoData.materias)) {
          await cursosCollection.doc(cursoId).update({
            materias: FieldValue.arrayUnion(id)
          });
        }
        else {
          await cursosCollection.doc(cursoId).update({
            materias: [id]
          });
        }
      }
    }

    return res.json({
      message: "Materia actualizada exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("updateMateria error:", err);
    return res.status(500).json({ error: "Error al actualizar materia" });
  }
};

export const toggleMateriaStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const { id } = req.params;

    const materiaExists = await materiasCollection.doc(id).get();
    if (!materiaExists.exists) {
      return res.status(404).json({ error: "Materia no encontrada" });
    }

    const currentData = materiaExists.data();
    // Si no existe el campo activo, asumir que está activo (true) por defecto
    const currentActivo = currentData?.activo !== undefined ? currentData.activo : true;
    const newActivo = !currentActivo;

    await materiasCollection.doc(id).update({
      activo: newActivo,
      fechaActualizacion: new Date(),
    });

    // Obtener el documento actualizado
    const updatedDoc = await materiasCollection.doc(id).get();
    const updatedData = updatedDoc.data();

    return res.json({
      message: `Materia ${newActivo ? "habilitada" : "deshabilitada"} exitosamente`,
      id: id,
      materia: {
        id: updatedDoc.id,
        ...updatedData,
        activo: newActivo,
      },
    });
  } catch (err) {
    console.error("toggleMateriaStatus error:", err);
    return res.status(500).json({ error: "Error al cambiar estado de la materia" });
  }
};

export const deleteMateria = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const { id } = req.params;

    const materiaExists = await materiasCollection.doc(id).get();
    if (!materiaExists.exists) {
      return res.status(404).json({ error: "Materia no encontrada" });
    }

    const cursosCollection = firestore.collection("cursos");
    const cursosConMateria = await cursosCollection
      .where("materias", "array-contains", id)
      .get();

    for (const cursoId of cursosConMateria.docs) {
      await cursosCollection.doc(cursoId.id).update({
        materias: FieldValue.arrayRemove(id)
      });
    }

    await materiasCollection.doc(id).delete();

    return res.json({
      message: "Materia eliminada exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("deleteMateria error:", err);
    return res.status(500).json({ error: "Error al eliminar materia" });
  }
};

export const toggleModuleForAllStudents = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const { id: materiaId } = req.params;
    const { moduleId, enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'El campo "enabled" debe ser un booleano' });
    }

    if (!moduleId || typeof moduleId !== 'string') {
      return res.status(400).json({ error: 'El campo "moduleId" es requerido' });
    }

    // Verificar que la materia existe
    const materiaExists = await materiasCollection.doc(materiaId).get();
    if (!materiaExists.exists) {
      return res.status(404).json({ error: "Materia no encontrada" });
    }

    const materiaData = materiaExists.data();
    if (!materiaData?.modulos || !materiaData.modulos.includes(moduleId)) {
      return res.status(404).json({ error: "El módulo no pertenece a esta materia" });
    }

    // Verificar que el módulo existe
    const moduloExists = await modulosCollection.doc(moduleId).get();
    if (!moduloExists.exists) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    // Persistir estado global en subcolección materias/{materiaId}/modulos_estado/{moduleId}
    await materiasCollection
      .doc(materiaId)
      .collection("modulos_estado")
      .doc(moduleId)
      .set({ enabledGlobal: enabled }, { merge: true });

    // Limpiar overrides individuales de todos los usuarios con esta materia.
    // Esto asegura que el estado global tome efecto para todos (incluyendo usuarios
    // con datos viejos en modulos_habilitados), sin necesidad de migración manual.
    const cursosConMateria = await cursosCollection
      .where("materias", "array-contains", materiaId)
      .get();

    let updatedUsers = 0;

    if (!cursosConMateria.empty) {
      const cursoIds = cursosConMateria.docs.map((d) => d.id);
      const usersCollection = firestore.collection("users");
      const allUsers = await usersCollection.get();

      const usersWithOverride = allUsers.docs.filter((userDoc) => {
        const userData = userDoc.data();
        const cursosAsignados: string[] = userData?.cursos_asignados || [];
        const hasRelevantCourse = cursoIds.some((cid) => cursosAsignados.includes(cid));
        // Solo actualizar usuarios que tengan un override explícito para este módulo
        return hasRelevantCourse && userData?.modulos_habilitados && moduleId in userData.modulos_habilitados;
      });

      if (usersWithOverride.length > 0) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < usersWithOverride.length; i += BATCH_SIZE) {
          const batch = firestore.batch();
          const chunk = usersWithOverride.slice(i, i + BATCH_SIZE);
          for (const userDoc of chunk) {
            batch.update(userDoc.ref, {
              [`modulos_habilitados.${moduleId}`]: FieldValue.delete(),
            });
          }
          await batch.commit();
        }
        updatedUsers = usersWithOverride.length;
      }
    }

    return res.json({
      message: `Módulo ${enabled ? 'habilitado' : 'deshabilitado'} exitosamente para todos los estudiantes con esta materia`,
      updatedUsers,
      materiaId,
      moduleId,
      enabled,
    });
  } catch (err) {
    console.error("toggleModuleForAllStudents error:", err);
    return res.status(500).json({ error: "Error al actualizar módulos de manera grupal" });
  }
};

/**
 * Devuelve el estado habilitado de cada módulo de la materia según la BD:
 * lee exclusivamente desde materias/{materiaId}/modulos_estado/{moduloId}.enabledGlobal.
 */
export const getModulosHabilitadosEstado = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const { id: materiaId } = req.params;
    const materiaDoc = await materiasCollection.doc(materiaId).get();
    if (!materiaDoc.exists) {
      return res.status(404).json({ error: "Materia no encontrada" });
    }

    const materiaData = materiaDoc.data();
    const modulosIds: string[] = materiaData?.modulos || [];
    if (modulosIds.length === 0) {
      return res.json({ modulos_habilitados_estado: {} });
    }

    const modulosEstadoRef = materiasCollection
      .doc(materiaId)
      .collection("modulos_estado");

    // Leer todos los estados en paralelo. Si no existe doc (materia antigua), primer módulo = true, resto = false.
    const docs = await Promise.all(modulosIds.map((moduleId) => modulosEstadoRef.doc(moduleId).get()));
    const estado: Record<string, boolean> = {};
    for (let i = 0; i < modulosIds.length; i++) {
      const doc = docs[i];
      const defaultValue = i === 0; // primer módulo habilitado por defecto
      estado[modulosIds[i]] = doc.exists ? (doc.data()?.enabledGlobal === true) : defaultValue;
    }
    return res.json({ modulos_habilitados_estado: estado });
  } catch (err) {
    console.error("getModulosHabilitadosEstado error:", err);
    return res.status(500).json({ error: "Error al obtener estado de módulos" });
  }
};
