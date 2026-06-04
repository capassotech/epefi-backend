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

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const pageParam = Number.parseInt(req.query.page as string, 10);
    const limitParam = Number.parseInt(req.query.limit as string, 10);
    const page = Number.isNaN(pageParam) ? 1 : Math.max(pageParam, 1);
    const perPage = Number.isNaN(limitParam) ? 10 : Math.max(limitParam, 1);
    const search = ((req.query.search as string) || "").trim().toLowerCase();
    const status = ((req.query.status as string) || "").trim().toLowerCase();
    const sortBy = ((req.query.sortBy as string) || "fechaCreacion").trim();
    const sortOrder = ((req.query.sortOrder as string) || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc";

    const snapshot = await cursosCollection.get();

    const courses = snapshot.docs.map((doc) => formatFirestoreDoc(doc));

    const filteredCourses = courses
      .filter((course: any) => {
        if (!search) return true;
        const title = (course?.titulo || "").toString().toLowerCase();
        return title.includes(search);
      })
      .filter((course: any) => {
        if (!status) return true;
        if (status !== "activo" && status !== "inactivo") return true;
        const courseStatus = (course?.estado || "activo").toString().toLowerCase();
        return courseStatus === status;
      })
      .sort((a: any, b: any) => {
        let aValue: string | number = "";
        let bValue: string | number = "";

        if (sortBy === "titulo") {
          aValue = (a?.titulo || "").toString().toLowerCase();
          bValue = (b?.titulo || "").toString().toLowerCase();
        } else if (sortBy === "precio") {
          aValue = typeof a?.precio === "number" ? a.precio : Number(a?.precio || 0);
          bValue = typeof b?.precio === "number" ? b.precio : Number(b?.precio || 0);
        } else if (sortBy === "estudiantes") {
          const aStudents = Array.isArray(a?.estudiantes) ? a.estudiantes.length : Number(a?.estudiantes || 0);
          const bStudents = Array.isArray(b?.estudiantes) ? b.estudiantes.length : Number(b?.estudiantes || 0);
          aValue = Number.isNaN(aStudents) ? 0 : aStudents;
          bValue = Number.isNaN(bStudents) ? 0 : bStudents;
        } else {
          aValue = a?.fechaCreacion ? new Date(a.fechaCreacion).getTime() : 0;
          bValue = b?.fechaCreacion ? new Date(b.fechaCreacion).getTime() : 0;
        }

        if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
        if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });

    const total = filteredCourses.length;
    const start = (page - 1) * perPage;
    const paginatedCourses = filteredCourses.slice(start, start + perPage);
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);

    return res.json({
      data: paginatedCourses,
      pagination: {
        total,
        page,
        perPage,
        count: paginatedCourses.length,
        totalPages,
      },
    });
  } catch (err) {
    console.error("getAllCourses error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};

export const getCoursesByUserId = async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log("getCoursesByUserId llamado con ID:", req.params.id);
    const { id } = req.params;
    const authenticatedUserId = req.user?.uid;
    
    console.log("Buscando usuario con ID:", id);
    
    // Verificar que el usuario autenticado sea el mismo que solicita sus cursos, o sea admin
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    // validate that the user exists
    const userDoc = await firestore.collection('users').doc(id).get();
    if (!userDoc.exists) {
      console.log("Usuario no encontrado en Firestore, retornando array vacío");
      // Si el usuario no existe en Firestore, retornar array vacío en lugar de 404
      // Esto puede pasar si el usuario existe en Firebase Auth pero no en Firestore
      return res.json([]);
    }

    const userData = userDoc.data();
    
    // Verificar que el usuario esté activo
    if (userData?.activo === false) {
      console.log("Usuario deshabilitado, retornando array vacío");
      return res.json([]);
    }

    // Verificar que el usuario autenticado sea el mismo que solicita sus cursos, o sea admin
    const isAdmin = await validateUser(req);
    if (!isAdmin && authenticatedUserId !== id) {
      return res.status(403).json({ error: "No autorizado para acceder a estos cursos" });
    }

    // Search into cursos_asignados field and take all courses ids
    const cursos_asignados = userData?.cursos_asignados;
    
    // Si no hay cursos asignados o el array está vacío, retornar array vacío
    if (!cursos_asignados || !Array.isArray(cursos_asignados) || cursos_asignados.length === 0) {
      console.log("Usuario no tiene cursos asignados");
      return res.json([]);
    }

    // Get all courses by its ids in parallel
    const courseDocs = await Promise.all(
      cursos_asignados.map((id: string) => cursosCollection.doc(id).get())
    );
    const courses = courseDocs
      .filter((doc) => doc.exists)
      .map((doc) => formatFirestoreDoc(doc));

    console.log(`Retornando ${courses.length} cursos para el usuario`);

    return res.json(courses);
  } catch (err) {
    console.error("getCoursesByUserId error:", err);
    return res.status(500).json({ error: "Error al obtener cursos" });
  }
};

export const getCourseById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const authenticatedUserId = req.user?.uid;
    
    console.log(`[getCourseById] Buscando curso con ID: ${id}`);
    
    // Verificar que el usuario esté autenticado
    if (!authenticatedUserId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    // Verificar que el usuario esté activo
    const userDoc = await firestore.collection('users').doc(authenticatedUserId).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      if (userData?.activo === false) {
        return res.status(403).json({ error: "Usuario deshabilitado" });
      }
    }
    
    const doc = await cursosCollection.doc(id).get();

    if (!doc.exists) {
      console.log(`[getCourseById] Curso con ID ${id} no encontrado`);
      return res.status(404).json({ error: "Curso no encontrado" });
    }

    // Verificar que el usuario tenga acceso al curso (esté asignado o sea admin)
    const isAdmin = await validateUser(req);
    if (!isAdmin) {
      const userData = userDoc.data();
      const cursos_asignados = userData?.cursos_asignados || [];
      if (!cursos_asignados.includes(id)) {
        return res.status(403).json({ error: "No tienes acceso a este curso" });
      }
    }

    console.log(`[getCourseById] Curso encontrado: ${id}`);
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

    // Validar fechas si están presentes
    // if (courseData && courseData.fechaFin) {
    //   if (courseData.fechaInicio >= courseData.fechaFin) {
    //     return res.status(400).json({
    //       error: "La fecha de inicio debe ser anterior a la fecha de fin",
    //     });
    //   }
    // }

    // Convertir fechas de string ISO a objetos Date para Firestore
    const fechaInicioDictado = courseData.fechaInicioDictado 
      ? new Date(courseData.fechaInicioDictado) 
      : null;
    const fechaFinDictado = courseData.fechaFinDictado 
      ? new Date(courseData.fechaFinDictado) 
      : null;

    // Agregar fechas de auditoría
    const courseWithDates: any = {
      ...courseData,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    };

    // Asignar fechas convertidas a objetos Date
    if (fechaInicioDictado && !isNaN(fechaInicioDictado.getTime())) {
      courseWithDates.fechaInicioDictado = fechaInicioDictado;
    }
    if (fechaFinDictado && !isNaN(fechaFinDictado.getTime())) {
      courseWithDates.fechaFinDictado = fechaFinDictado;
    }

    // Agregar fechas de actualización de PDFs si se proporcionan las URLs
    if (courseData.planDeEstudiosUrl) {
      courseWithDates.planDeEstudiosFechaActualizacion = new Date();
    }
    if (courseData.fechasDeExamenesUrl) {
      courseWithDates.fechasDeExamenesFechaActualizacion = new Date();
    }

    const docRef = await cursosCollection.add(courseWithDates);

    // Obtener el documento guardado para formatear las fechas correctamente
    const savedDoc = await docRef.get();
    const formattedDoc = formatFirestoreDoc(savedDoc);

    return res.status(201).json({
      id: docRef.id,
      message: "Curso creado exitosamente",
      ...formattedDoc,
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
    const dataToUpdate: any = {
      ...updateData,
      fechaActualizacion: new Date(),
    };

    // Convertir fechas de string ISO a objetos Date para Firestore (si están presentes)
    if (updateData.fechaInicioDictado) {
      const fechaInicio = new Date(updateData.fechaInicioDictado);
      if (!isNaN(fechaInicio.getTime())) {
        dataToUpdate.fechaInicioDictado = fechaInicio;
      }
    }
    if (updateData.fechaFinDictado) {
      const fechaFin = new Date(updateData.fechaFinDictado);
      if (!isNaN(fechaFin.getTime())) {
        dataToUpdate.fechaFinDictado = fechaFin;
      }
    }

    // Actualizar fechas de actualización de PDFs si se están actualizando las URLs
    const currentData = courseExists.data();
    
    // Si se está actualizando planDeEstudiosUrl y es diferente al actual, actualizar la fecha
    if (updateData.planDeEstudiosUrl !== undefined) {
      if (updateData.planDeEstudiosUrl && updateData.planDeEstudiosUrl !== currentData?.planDeEstudiosUrl) {
        dataToUpdate.planDeEstudiosFechaActualizacion = new Date();
      } else if (!updateData.planDeEstudiosUrl) {
        // Si se está eliminando la URL, también eliminar la fecha de actualización
        dataToUpdate.planDeEstudiosFechaActualizacion = null;
      }
    }

    // Si se está actualizando fechasDeExamenesUrl y es diferente al actual, actualizar la fecha
    if (updateData.fechasDeExamenesUrl !== undefined) {
      if (updateData.fechasDeExamenesUrl && updateData.fechasDeExamenesUrl !== currentData?.fechasDeExamenesUrl) {
        dataToUpdate.fechasDeExamenesFechaActualizacion = new Date();
      } else if (!updateData.fechasDeExamenesUrl) {
        // Si se está eliminando la URL, también eliminar la fecha de actualización
        dataToUpdate.fechasDeExamenesFechaActualizacion = null;
      }
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

export const toggleCourseStatus = async (
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

    const currentData = courseExists.data();
    const currentEstado = currentData?.estado || "activo";
    const newEstado = currentEstado === "activo" ? "inactivo" : "activo";

    await cursosCollection.doc(id).update({
      estado: newEstado,
      fechaActualizacion: new Date(),
    });

    // Obtener el documento actualizado
    const updatedDoc = await cursosCollection.doc(id).get();
    const formattedDoc = formatFirestoreDoc(updatedDoc);

    return res.json({
      message: `Curso ${newEstado === "activo" ? "habilitado" : "deshabilitado"} exitosamente`,
      id: id,
      curso: formattedDoc,
    });
  } catch (err) {
    console.error("toggleCourseStatus error:", err);
    return res.status(500).json({ error: "Error al cambiar estado del curso" });
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
