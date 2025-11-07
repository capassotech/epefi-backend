// src/modules/cursos/controller.ts
import type { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type {
  ValidatedCourse,
  ValidatedUpdateCourse
} from "../../types/schemas";
import { validateUser } from "../../utils/utils";

const cursosCollection = firestore.collection("cursos");
const materiasCollection = firestore.collection("materias");

export const getAllCourses = async (_: Request, res: Response) => {
  try {
    const snapshot = await cursosCollection.get();

    if (snapshot.empty) {
      return res.json([]);
    }

    const courses = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(courses);
  } catch (err) {
    console.error("getAllCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};

export const getCoursesByUserId = async (req: Request, res: Response) => {
  try {
    console.log("getCoursesByUserId llamado con ID:", req.params.id);
    const { id } = req.params;
    console.log("Buscando usuario con ID:", id);
    // validate that the user exists
    const userDoc = await firestore.collection('users').doc(id).get();
    if (!userDoc.exists) {
      console.log("Usuario no encontrado en Firestore, retornando array vacío");
      // Si el usuario no existe en Firestore, retornar array vacío en lugar de 404
      // Esto puede pasar si el usuario existe en Firebase Auth pero no en Firestore
      return res.json([]);
    }

    // Search into cursos_asignados field and take all courses ids
    const cursos_asignados = userDoc.data()?.cursos_asignados;
    
    // Si no hay cursos asignados o el array está vacío, retornar array vacío
    if (!cursos_asignados || !Array.isArray(cursos_asignados) || cursos_asignados.length === 0) {
      console.log("Usuario no tiene cursos asignados");
      return res.json([]);
    }

    // Get all courses by its ids
    const courses = [];
    for (const curso_id of cursos_asignados) {
      const doc = await cursosCollection.doc(curso_id).get();
      // Si un curso no existe, simplemente lo omitimos en lugar de retornar error
      if (doc.exists) {
        courses.push({ id: doc.id, ...doc.data() });
      }
    }

    console.log(`Retornando ${courses.length} cursos para el usuario`);

    return res.json(courses);
  } catch (err) {
    console.error("getCoursesByUserId error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};

export const getCourseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await cursosCollection.doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("getCourseById error:", err);
    return res.status(500).json({ error: "Error al obtener curso" });
  }
};

export const createCourse = async (
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
    const courseData: ValidatedCourse = req.body;

    // Verificar que todas las materias existen (solo si hay materias)
    if (courseData.materias && courseData.materias.length > 0) {
      for (const materiaId of courseData.materias) {
        const materiaExists = await materiasCollection.doc(materiaId).get();
        if (!materiaExists.exists) {
          return res.status(404).json({
            error: `La materia con ID "${materiaId}" no existe`,
          });
        }
      }
    }

    // Validar fechas si están presentes
    // if (courseData && courseData.fechaFin) {
    //   if (courseData.fechaInicio >= courseData.fechaFin) {
    //     return res.status(400).json({
    //       error: "La fecha de inicio debe ser anterior a la fecha de fin",
    //     });
    //   }
    // }

    // Agregar fechas de auditoría
    const courseWithDates = {
      ...courseData,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    };

    const docRef = await cursosCollection.add(courseWithDates);

    return res.status(201).json({
      id: docRef.id,
      message: "Curso creado exitosamente",
      ...courseWithDates,
    });
  } catch (err) {
    console.error("createCourse error:", err);
    return res.status(500).json({ error: "Error al crear curso" });
  }
};

export const updateCourse = async (
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
    const updateData: ValidatedUpdateCourse = req.body;

    const courseExists = await cursosCollection.doc(id).get();
    if (!courseExists.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    // Verificar que todas las materias existen (solo si se están actualizando)
    if (updateData.materias && updateData.materias.length > 0) {
      for (const materiaId of updateData.materias) {
        const materiaExists = await materiasCollection.doc(materiaId).get();
        if (!materiaExists.exists) {
          return res.status(404).json({
            error: `La materia con ID "${materiaId}" no existe`,
          });
        }
      }
    }

    // Validar fechas si están siendo actualizadas
    // const currentData = courseExists.data();
    // const fechaInicio = updateData.fechaInicio || currentData?.fechaInicio;
    // const fechaFin = updateData.fechaFin || currentData?.fechaFin;

    // if (fechaInicio && fechaFin && fechaInicio >= fechaFin) {
    //   return res.status(400).json({
    //     error: "La fecha de inicio debe ser anterior a la fecha de fin",
    //   });
    // }

    // Agregar fecha de actualización
    const dataToUpdate = {
      ...updateData,
      fechaActualizacion: new Date(),
    };

    await cursosCollection.doc(id).update(dataToUpdate);

    return res.json({
      message: "Curso actualizado exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("updateCourse error:", err);
    return res.status(500).json({ error: "Error al actualizar curso" });
  }
};

export const deleteCourse = async (
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

    const courseExists = await cursosCollection.doc(id).get();
    if (!courseExists.exists) {
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    // Eliminar el curso físicamente (las materias asociadas no se eliminan)
    await cursosCollection.doc(id).delete();

    return res.json({
      message: "Curso eliminado exitosamente",
      id: id,
    });
  } catch (err) {
    console.error("deleteCourse error:", err);
    return res.status(500).json({ error: "Error al eliminar curso" });
  }
};
