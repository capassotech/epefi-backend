// src/modules/cursos/controller.ts
import type { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type {
  ValidatedCourse,
  ValidatedUpdateCourse
} from "../../types/schemas";
import { validateUser, formatFirestoreDoc } from "../../utils/utils";

const cursosCollection = firestore.collection("cursos");
const materiasCollection = firestore.collection("materias");

export const getAllCourses = async (_: Request, res: Response) => {
  try {
    const snapshot = await cursosCollection.get();

    if (snapshot.empty) {
      return res.json([]);
    }

    const courses = snapshot.docs.map((doc) => formatFirestoreDoc(doc));

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
        courses.push(formatFirestoreDoc(doc));
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

    return res.json(formatFirestoreDoc(doc));
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

    // Validar fechas de dictado si están presentes
    if (courseData.fechaInicioDictado && courseData.fechaFinDictado) {
      const fechaInicio = courseData.fechaInicioDictado instanceof Date 
        ? courseData.fechaInicioDictado 
        : new Date(courseData.fechaInicioDictado);
      const fechaFin = courseData.fechaFinDictado instanceof Date 
        ? courseData.fechaFinDictado 
        : new Date(courseData.fechaFinDictado);
      
      if (fechaInicio >= fechaFin) {
        return res.status(400).json({
          error: "La fecha de inicio de dictado debe ser anterior a la fecha de fin de dictado",
        });
      }
    }

    // Agregar fechas de auditoría
    // Asegurarse de que las fechas sean objetos Date válidos antes de guardar
    const courseWithDates: any = {
      ...courseData,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    };
    
    // Asegurar que las fechas sean objetos Date válidos y se incluyan explícitamente
    // Esto es importante porque Firestore necesita objetos Date, no strings
    if (courseData.fechaInicioDictado !== undefined && courseData.fechaInicioDictado !== null) {
      let fechaInicio: Date;
      if (courseData.fechaInicioDictado instanceof Date) {
        fechaInicio = courseData.fechaInicioDictado;
      } else if (typeof courseData.fechaInicioDictado === "string") {
        fechaInicio = new Date(courseData.fechaInicioDictado);
      } else {
        fechaInicio = new Date(courseData.fechaInicioDictado as any);
      }
      
      // Validar que la fecha sea válida
      if (!isNaN(fechaInicio.getTime())) {
        courseWithDates.fechaInicioDictado = fechaInicio;
      }
    }
    
    if (courseData.fechaFinDictado !== undefined && courseData.fechaFinDictado !== null) {
      let fechaFin: Date;
      if (courseData.fechaFinDictado instanceof Date) {
        fechaFin = courseData.fechaFinDictado;
      } else if (typeof courseData.fechaFinDictado === "string") {
        fechaFin = new Date(courseData.fechaFinDictado);
      } else {
        fechaFin = new Date(courseData.fechaFinDictado as any);
      }
      
      // Validar que la fecha sea válida
      if (!isNaN(fechaFin.getTime())) {
        courseWithDates.fechaFinDictado = fechaFin;
      }
    }

    const docRef = await cursosCollection.add(courseWithDates);

    // Convertir fechas a ISO string para la respuesta
    const responseData: any = {
      id: docRef.id,
      message: "Curso creado exitosamente",
      ...courseWithDates,
    };
    
    // Convertir fechas Date a ISO string
    if (responseData.fechaInicioDictado instanceof Date) {
      responseData.fechaInicioDictado = responseData.fechaInicioDictado.toISOString();
    }
    if (responseData.fechaFinDictado instanceof Date) {
      responseData.fechaFinDictado = responseData.fechaFinDictado.toISOString();
    }
    if (responseData.fechaCreacion instanceof Date) {
      responseData.fechaCreacion = responseData.fechaCreacion.toISOString();
    }
    if (responseData.fechaActualizacion instanceof Date) {
      responseData.fechaActualizacion = responseData.fechaActualizacion.toISOString();
    }

    return res.status(201).json(responseData);
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

    // Validar fechas de dictado si están siendo actualizadas
    const currentData = courseExists.data();
    const fechaInicioDictado = updateData.fechaInicioDictado 
      ? (updateData.fechaInicioDictado instanceof Date 
          ? updateData.fechaInicioDictado 
          : new Date(updateData.fechaInicioDictado))
      : (currentData?.fechaInicioDictado?.toDate 
          ? currentData.fechaInicioDictado.toDate() 
          : currentData?.fechaInicioDictado);
    const fechaFinDictado = updateData.fechaFinDictado 
      ? (updateData.fechaFinDictado instanceof Date 
          ? updateData.fechaFinDictado 
          : new Date(updateData.fechaFinDictado))
      : (currentData?.fechaFinDictado?.toDate 
          ? currentData.fechaFinDictado.toDate() 
          : currentData?.fechaFinDictado);

    if (fechaInicioDictado && fechaFinDictado) {
      const inicio = fechaInicioDictado instanceof Date ? fechaInicioDictado : new Date(fechaInicioDictado);
      const fin = fechaFinDictado instanceof Date ? fechaFinDictado : new Date(fechaFinDictado);
      
      if (inicio >= fin) {
        return res.status(400).json({
          error: "La fecha de inicio de dictado debe ser anterior a la fecha de fin de dictado",
        });
      }
    }

    // Agregar fecha de actualización
    // Asegurarse de que las fechas sean objetos Date válidos antes de actualizar
    const dataToUpdate: any = {
      ...updateData,
      fechaActualizacion: new Date(),
    };
    
    // Asegurar que las fechas sean objetos Date válidos si están presentes
    // IMPORTANTE: Verificar tanto undefined como null, y también strings
    if (updateData.fechaInicioDictado !== undefined && updateData.fechaInicioDictado !== null) {
      const fechaInicioValue: any = updateData.fechaInicioDictado;
      let fechaInicio: Date;
      if (fechaInicioValue instanceof Date) {
        fechaInicio = fechaInicioValue;
      } else if (typeof fechaInicioValue === "string") {
        const trimmed = fechaInicioValue.trim();
        fechaInicio = trimmed !== "" ? new Date(trimmed) : new Date(fechaInicioValue);
      } else {
        fechaInicio = new Date(fechaInicioValue);
      }
      
      // Validar que la fecha sea válida antes de guardar
      if (!isNaN(fechaInicio.getTime())) {
        dataToUpdate.fechaInicioDictado = fechaInicio;
      } else {
        // Si la fecha es inválida, eliminarla del objeto para que no se guarde
        delete dataToUpdate.fechaInicioDictado;
      }
    } else {
      // Si viene como null o undefined, eliminarlo explícitamente para que no se guarde
      delete dataToUpdate.fechaInicioDictado;
    }
    
    if (updateData.fechaFinDictado !== undefined && updateData.fechaFinDictado !== null) {
      const fechaFinValue: any = updateData.fechaFinDictado;
      let fechaFin: Date;
      if (fechaFinValue instanceof Date) {
        fechaFin = fechaFinValue;
      } else if (typeof fechaFinValue === "string") {
        const trimmed = fechaFinValue.trim();
        fechaFin = trimmed !== "" ? new Date(trimmed) : new Date(fechaFinValue);
      } else {
        fechaFin = new Date(fechaFinValue);
      }
      
      // Validar que la fecha sea válida antes de guardar
      if (!isNaN(fechaFin.getTime())) {
        dataToUpdate.fechaFinDictado = fechaFin;
      } else {
        // Si la fecha es inválida, eliminarla del objeto para que no se guarde
        delete dataToUpdate.fechaFinDictado;
      }
    } else {
      // Si viene como null o undefined, eliminarlo explícitamente para que no se guarde
      delete dataToUpdate.fechaFinDictado;
    }

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
