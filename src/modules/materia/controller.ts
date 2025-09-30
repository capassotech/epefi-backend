// src/modules/materia/controller.ts
import type { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type {
  ValidatedMateria,
  ValidatedUpdateMateria,
} from "../../types/schemas";
import { validateUser } from "../../utils/utils";

const materiasCollection = firestore.collection("materias");
const modulosCollection = firestore.collection("modulos");
const cursosCollection = firestore.collection("cursos");

export const getAllMaterias = async (_: Request, res: Response) => {
  try {
    const snapshot = await materiasCollection.get();

    if (snapshot.empty) {
      return res.json([]);
    }

    const materias = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

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

    return res.json({ id: doc.id, ...doc.data() });
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

    // Agregar fechas de auditoría
    const materiaWithDates = {
      ...materiaData,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    };

    const docRef = await materiasCollection.add(materiaWithDates);

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

    // Si se está actualizando el código, verificar que no exista ya
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

    // Agregar fecha de actualización
    const dataToUpdate = {
      ...updateData,
      fechaActualizacion: new Date(),
    };

    await materiasCollection.doc(id).update(dataToUpdate);

    return res.json({
      message: "Materia actualizada exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("updateMateria error:", err);
    return res.status(500).json({ error: "Error al actualizar materia" });
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

    // Verificar si la materia está siendo usada como prerrequisito
    const materiasConPrerequisito = await materiasCollection
      .where("prerrequisitos", "array-contains", id)
      .get();

    if (!materiasConPrerequisito.empty) {
      return res.status(409).json({
        error:
          "No se puede eliminar la materia porque está siendo usada como prerrequisito de otras materias",
      });
    }

    // Verificar si la materia está siendo usada en cursos
    const cursosCollection = firestore.collection("cursos");
    const cursosConMateria = await cursosCollection
      .where("materias", "array-contains", id)
      .get();

    if (!cursosConMateria.empty) {
      return res.status(409).json({
        error:
          "No se puede eliminar la materia porque está siendo usada en cursos activos",
      });
    }

    // En lugar de eliminar completamente, marcar como inactiva
    await materiasCollection.doc(id).update({
      activa: false,
      fechaActualizacion: new Date(),
    });

    return res.json({
      message: "Materia desactivada exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("deleteMateria error:", err);
    return res.status(500).json({ error: "Error al desactivar materia" });
  }
};
