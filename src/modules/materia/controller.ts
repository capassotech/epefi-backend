// src/modules/materia/controller.ts
import type { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type {
  ValidatedMateria,
  ValidatedUpdateMateria,
} from "../../types/courses";
import { validateUser } from "../../utils/utils";

const materiasCollection = firestore.collection("materias");
const modulosCollection = firestore.collection("modulos");

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
      .where("codigo", "==", materiaData.codigo)
      .get();

    if (!existingMateria.empty) {
      return res.status(409).json({
        error: `Ya existe una materia con el código "${materiaData.codigo}"`,
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

    // Verificar que todos los prerrequisitos existen (solo si hay prerrequisitos)
    // if (materiaData.prerrequisitos && materiaData.prerrequisitos.length > 0) {
    //   for (const prerequisitoId of materiaData.prerrequisitos) {
    //     const prerequisitoExists = await materiasCollection
    //       .doc(prerequisitoId)
    //       .get();
    //     if (!prerequisitoExists.exists) {
    //       return res.status(404).json({
    //         error: `La materia prerequisito con ID "${prerequisitoId}" no existe`,
    //       });
    //     }
    //   }
    // }

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
    if (updateData.codigo) {
      const existingMateria = await materiasCollection
        .where("codigo", "==", updateData.codigo)
        .get();

      // Si existe y no es la misma materia que estamos actualizando
      if (!existingMateria.empty && existingMateria.docs[0].id !== id) {
        return res.status(409).json({
          error: `Ya existe una materia con el código "${updateData.codigo}"`,
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

    // Verificar prerrequisitos si se están actualizando
    // if (updateData.prerrequisitos && updateData.prerrequisitos.length > 0) {
    //   for (const prerequisitoId of updateData.prerrequisitos) {
    //     // No puede ser prerrequisito de sí misma
    //     if (prerequisitoId === id) {
    //       return res.status(400).json({
    //         error: "Una materia no puede ser prerrequisito de sí misma",
    //       });
    //     }

    //     const prerequisitoExists = await materiasCollection
    //       .doc(prerequisitoId)
    //       .get();
    //     if (!prerequisitoExists.exists) {
    //       return res.status(404).json({
    //         error: `La materia prerequisito con ID "${prerequisitoId}" no existe`,
    //       });
    //     }
    //   }
    // }

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
