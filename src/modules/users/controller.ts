import { Request, Response } from 'express';
import { firebaseAuth, firestore } from '../../config/firebase';
import { ValidatedUpdateUser, ValidatedUser, ValidatedUpdateProfile } from '../../types/schemas';
import { validateUser } from '../../utils/utils';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

// Función auxiliar para inicializar módulos habilitados de un curso
// Solo habilita el primer módulo de cada materia, deshabilita los demás
const initializeCourseModules = async (courseId: string): Promise<Record<string, boolean>> => {
  const modulosHabilitados: Record<string, boolean> = {};
  
  const courseDoc = await firestore.collection('cursos').doc(courseId).get();
  if (!courseDoc.exists) {
    return modulosHabilitados;
  }

  const courseData = courseDoc.data();
  const materiasIds = courseData?.materias || [];

  // Obtener todas las materias del curso
  const materiasCollection = firestore.collection('materias');
  for (const materiaId of materiasIds) {
    const materiaDoc = await materiasCollection.doc(materiaId).get();
    if (materiaDoc.exists) {
      const materiaData = materiaDoc.data();
      const modulosIds = materiaData?.modulos || [];
      
      // Habilitar solo el primer módulo, deshabilitar los demás
      modulosIds.forEach((moduloId: string, index: number) => {
        if (index === 0) {
          // Primer módulo: habilitado
          modulosHabilitados[moduloId] = true;
        } else {
          // Resto de módulos: deshabilitados
          modulosHabilitados[moduloId] = false;
        }
      });
    }
  }

  return modulosHabilitados;
};

export const getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user.uid;
    const userDoc = await firestore.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    
    // Devolver solo los campos permitidos para la vista del perfil
    const profileData = {
      uid: uid,
      nombre: userData?.nombre || '',
      apellido: userData?.apellido || '',
      dni: userData?.dni || '',
      email: userData?.email || '',
      role: userData?.role || { admin: false, student: true },
      activo: userData?.activo !== undefined ? userData.activo : true,
      fechaRegistro: userData?.fechaRegistro || userData?.fechaCreacion || null,
    };

    return res.json(profileData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Error al obtener el perfil del usuario' });
  }
};

export const getUser = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  const uid = req.params.id;
  const userDoc = await firestore.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  return res.json({
    id: userDoc.id,
    uid: userDoc.id,
    ...userDoc.data()
  });
};

export const getUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
      return res.status(403).json({
        error: "No autorizado. Se requieren permisos de administrador.",
      });
    }

    const userDocs = await firestore.collection('users').get();

    const users = userDocs.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`Found ${users.length} registered users`);

    return res.json(users);
  } catch (error) {
    console.error('Error fetching registered users:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const createUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
      return res.status(403).json({
        error: "No autorizado. Se requieren permisos de administrador.",
      });
    }

    const { email, nombre, apellido, dni, role, activo, cursos_asignados, emailVerificado, password }: ValidatedUser = req.body;
    
    if (cursos_asignados && cursos_asignados.length > 0) {
      for (const cursoId of cursos_asignados) {
        const cursoDoc = await firestore.collection('cursos').doc(cursoId).get();
        if (!cursoDoc.exists) {
          return res.status(404).json({ error: 'Curso no encontrado' });
        }
      }
    }

    const existingDniQuery = await firestore
      .collection("users")
      .where("dni", "==", dni)
      .get();

    if (!existingDniQuery.empty) {
      return res.status(409).json({
        error: "Ya existe un usuario registrado con este DNI",
      });
    }

    const userRecord = await firebaseAuth.createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`,
    });
    
    // Inicializar módulos habilitados para los cursos asignados
    let modulosHabilitados: Record<string, boolean> = {};
    if (cursos_asignados && cursos_asignados.length > 0) {
      for (const cursoId of cursos_asignados) {
        const courseModules = await initializeCourseModules(cursoId);
        modulosHabilitados = { ...modulosHabilitados, ...courseModules };
      }
    }
    
    const userDoc = await firestore.collection("users").doc(userRecord.uid).set({ 
      email, 
      nombre, 
      apellido, 
      dni, 
      role, 
      activo, 
      cursos_asignados, 
      emailVerificado,
      modulos_habilitados: modulosHabilitados
    });
    return res.status(200).json({ message: "Usuario creado correctamente", user: userDoc });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
      return res.status(403).json({
        error: "No autorizado. Se requieren permisos de administrador.",
      });
    }

    const uid = req.params.id;
    const updateData: ValidatedUpdateUser = req.body;
    
    // Limpiar el UID de espacios y caracteres especiales
    const cleanUid = uid?.trim();
    
    console.log('🔄 Actualizando usuario:', {
      originalUid: uid,
      cleanUid,
      uidType: typeof cleanUid,
      uidLength: cleanUid?.length,
      updateDataKeys: Object.keys(updateData),
      updateDataUid: updateData.uid,
      cursosAsignados: updateData.cursos_asignados?.length || 0,
      requestUrl: req.url,
      requestPath: req.path
    });
    
    if (!cleanUid || cleanUid === '') {
      console.error('❌ UID vacío o inválido:', { uid, cleanUid });
      return res.status(400).json({ error: 'ID de usuario inválido' });
    }
    
    const userDoc = await firestore.collection('users').doc(cleanUid).get();

    if (!userDoc.exists) {
      console.error('❌ Usuario no encontrado en Firestore:', {
        originalUid: uid,
        cleanUid,
        collection: 'users',
        documentExists: userDoc.exists,
        documentId: userDoc.id
      });
      
      // Intentar buscar por el uid del body si es diferente
      if (updateData.uid && updateData.uid.trim() !== cleanUid) {
        const altUserDoc = await firestore.collection('users').doc(updateData.uid.trim()).get();
        if (altUserDoc.exists) {
          console.log('✅ Usuario encontrado con UID alternativo del body:', {
            bodyUid: updateData.uid,
            documentId: altUserDoc.id
          });
          // Continuar con el UID del body
          const altCleanUid = updateData.uid.trim();
          const altUserDocForUpdate = await firestore.collection('users').doc(altCleanUid).get();
          // Actualizar usando el UID del body
          if (updateData.cursos_asignados && updateData.cursos_asignados.length > 0) {
            console.log('🔍 Validando cursos asignados (ruta alternativa):', {
              cantidad: updateData.cursos_asignados.length,
              cursos: updateData.cursos_asignados
            });
            
            for (const cursoId of updateData.cursos_asignados) {
              if (!cursoId || cursoId.trim() === '') {
                console.error('❌ Curso con ID vacío encontrado en la lista');
                return res.status(400).json({ 
                  error: 'Uno de los cursos asignados tiene un ID inválido',
                  cursoId: cursoId
                });
              }
              
              const cursoDoc = await firestore.collection('cursos').doc(cursoId.trim()).get();
              if (!cursoDoc.exists) {
                console.error('❌ Curso no encontrado en Firestore (ruta alternativa):', {
                  cursoId: cursoId,
                  cursoIdTrimmed: cursoId.trim(),
                  todosLosCursos: updateData.cursos_asignados
                });
                return res.status(400).json({ 
                  error: `El curso con ID "${cursoId}" no existe en el sistema`,
                  cursoId: cursoId,
                  tipo: 'curso_no_encontrado'
                });
              }
            }
          }
          const currentUserData = altUserDocForUpdate.data();
          const currentCursos = currentUserData?.cursos_asignados || [];
          const newCursos = updateData.cursos_asignados || [];
          const cursosNuevos = newCursos.filter((cursoId: string) => !currentCursos.includes(cursoId));
          let modulosHabilitados = currentUserData?.modulos_habilitados || {};
          if (cursosNuevos.length > 0) {
            for (const cursoId of cursosNuevos) {
              const courseModules = await initializeCourseModules(cursoId);
              modulosHabilitados = { ...modulosHabilitados, ...courseModules };
            }
            updateData.modulos_habilitados = modulosHabilitados;
          }
          await altUserDocForUpdate.ref.update(updateData);
          const updatedDoc = await firestore.collection('users').doc(altCleanUid).get();
          return res.status(200).json({
            message: 'Usuario actualizado correctamente',
            user: {
              id: updatedDoc.id,
              ...updatedDoc.data()
            }
          });
        }
      }
      
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    console.log('✅ Usuario encontrado en Firestore:', {
      originalUid: uid,
      cleanUid,
      documentId: userDoc.id,
      userData: {
        nombre: userDoc.data()?.nombre,
        apellido: userDoc.data()?.apellido,
        email: userDoc.data()?.email,
        uid: userDoc.data()?.uid
      }
    });

    if (updateData.cursos_asignados && updateData.cursos_asignados.length > 0) {
      console.log('🔍 Validando cursos asignados:', {
        cantidad: updateData.cursos_asignados.length,
        cursos: updateData.cursos_asignados
      });
      
      for (const cursoId of updateData.cursos_asignados) {
        if (!cursoId || cursoId.trim() === '') {
          console.error('❌ Curso con ID vacío encontrado en la lista');
          return res.status(400).json({ 
            error: 'Uno de los cursos asignados tiene un ID inválido',
            cursoId: cursoId
          });
        }
        
        const cursoDoc = await firestore.collection('cursos').doc(cursoId.trim()).get();
        if (!cursoDoc.exists) {
          console.error('❌ Curso no encontrado en Firestore:', {
            cursoId: cursoId,
            cursoIdTrimmed: cursoId.trim(),
            cursoIdLength: cursoId.length,
            todosLosCursos: updateData.cursos_asignados
          });
          return res.status(400).json({ 
            error: `El curso con ID "${cursoId}" no existe en el sistema`,
            cursoId: cursoId,
            tipo: 'curso_no_encontrado'
          });
        }
        
        console.log('✅ Curso validado:', {
          cursoId: cursoId,
          cursoTitulo: cursoDoc.data()?.titulo || 'Sin título'
        });
      }
    }

    // Si se están actualizando los cursos asignados, inicializar módulos habilitados para los nuevos cursos
    const currentUserData = userDoc.data();
    const currentCursos = currentUserData?.cursos_asignados || [];
    const newCursos = updateData.cursos_asignados || [];
    
    // Encontrar cursos nuevos (que no estaban antes)
    const cursosNuevos = newCursos.filter((cursoId: string) => !currentCursos.includes(cursoId));
    
    let modulosHabilitados = currentUserData?.modulos_habilitados || {};
    if (cursosNuevos.length > 0) {
      for (const cursoId of cursosNuevos) {
        const courseModules = await initializeCourseModules(cursoId);
        modulosHabilitados = { ...modulosHabilitados, ...courseModules };
      }
      updateData.modulos_habilitados = modulosHabilitados;
    }

    await userDoc.ref.update(updateData);

    const updatedDoc = await firestore.collection('users').doc(cleanUid).get();

    return res.status(200).json({
      message: 'Usuario actualizado correctamente',
      user: {
        id: updatedDoc.id,
        ...updatedDoc.data()
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  try {
    const uid = req.params.id;
    const userDoc = await firestore.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    try {
      await firebaseAuth.deleteUser(uid);
    } catch (authError: any) {
      if (authError.code !== 'auth/user-not-found') {
        console.error('Error deleting user from Firebase Auth:', authError);
        throw authError;
      }
    }

    // Eliminar el documento de Firestore
    await userDoc.ref.delete();

    return res.status(200).json({
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user.uid;
    const updateData: ValidatedUpdateProfile = req.body;

    const userDoc = await firestore.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const currentData = userDoc.data();

    // Validar que el DNI no esté en uso por otro usuario (solo si se está actualizando)
    if (updateData.dni && updateData.dni !== currentData?.dni) {
      const existingDniQuery = await firestore
        .collection("users")
        .where("dni", "==", updateData.dni)
        .get();

      if (!existingDniQuery.empty && existingDniQuery.docs[0].id !== uid) {
        return res.status(409).json({
          error: "Ya existe un usuario registrado con este DNI",
        });
      }
    }

    // Validar que el email no esté en uso por otro usuario (solo si se está actualizando)
    if (updateData.email && updateData.email !== currentData?.email) {
      const existingEmailQuery = await firestore
        .collection("users")
        .where("email", "==", updateData.email)
        .get();

      if (!existingEmailQuery.empty && existingEmailQuery.docs[0].id !== uid) {
        return res.status(409).json({
          error: "Ya existe un usuario registrado con este email",
        });
      }

      // Actualizar email en Firebase Auth también
      try {
        await firebaseAuth.updateUser(uid, {
          email: updateData.email,
        });
      } catch (error: any) {
        if (error.code === 'auth/email-already-exists') {
          return res.status(409).json({
            error: "Ya existe un usuario registrado con este email",
          });
        }
        throw error;
      }
    }

    // Preparar datos para actualizar (solo campos permitidos)
    const dataToUpdate: any = {};

    // Solo agregar campos que realmente están siendo actualizados
    if (updateData.nombre !== undefined && updateData.nombre !== null && updateData.nombre.trim() !== '') {
      dataToUpdate.nombre = updateData.nombre.trim();
    }
    if (updateData.apellido !== undefined && updateData.apellido !== null && updateData.apellido.trim() !== '') {
      dataToUpdate.apellido = updateData.apellido.trim();
    }
    if (updateData.dni !== undefined && updateData.dni !== null && updateData.dni.trim() !== '') {
      dataToUpdate.dni = updateData.dni.trim();
    }
    if (updateData.email !== undefined && updateData.email !== null && updateData.email.trim() !== '') {
      dataToUpdate.email = updateData.email.trim();
    }

    // Verificar que hay al menos un campo para actualizar
    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({
        error: 'Debe proporcionar al menos un campo para actualizar',
      });
    }

    // Agregar fecha de actualización
    dataToUpdate.fechaActualizacion = new Date();

    // Actualizar displayName en Firebase Auth si cambió nombre o apellido
    const finalNombre = updateData.nombre !== undefined ? updateData.nombre.trim() : (currentData?.nombre || '');
    const finalApellido = updateData.apellido !== undefined ? updateData.apellido.trim() : (currentData?.apellido || '');
    
    if (updateData.nombre !== undefined || updateData.apellido !== undefined) {
      try {
        await firebaseAuth.updateUser(uid, {
          displayName: `${finalNombre} ${finalApellido}`.trim(),
        });
      } catch (error: any) {
        console.error('Error updating displayName in Firebase Auth:', error);
        // No fallar si solo falla el displayName, continuar con la actualización
      }
    }

    // Actualizar en Firestore
    await userDoc.ref.update(dataToUpdate);

    // Obtener el documento actualizado (forzar lectura fresca)
    // Usar un pequeño delay para asegurar que Firestore haya propagado los cambios
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const updatedDoc = await firestore.collection('users').doc(uid).get();
    const updatedData = updatedDoc.data();

    // Devolver solo los campos permitidos
    const profileData = {
      nombre: updatedData?.nombre || '',
      apellido: updatedData?.apellido || '',
      dni: updatedData?.dni || '',
      email: updatedData?.email || '',
    };

    // Devolver respuesta con estructura clara para el frontend
    return res.status(200).json({
      success: true,
      message: 'Perfil actualizado correctamente',
      user: profileData,
      data: profileData,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const asignCourseToUser = async (req: AuthenticatedRequest, res: Response) => {
  const isAuthorized = await validateUser(req);
  if (!isAuthorized) {
    return res.status(403).json({
      error: "No autorizado. Se requieren permisos de administrador.",
    });
  }

  const { id_curso } = req.body;
  const id_usuario = req.params.id;

  const userDoc = await firestore.collection('users').doc(id_usuario).get();
  const courseDoc = await firestore.collection('cursos').doc(id_curso).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  if (!courseDoc.exists) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }

  // Actualizar cursos asignados
  await userDoc.ref.update({ cursos_asignados: [...userDoc.data()?.cursos_asignados || [], id_curso] });

  // Inicializar módulos habilitados: solo el primer módulo de cada materia habilitado
  const userData = userDoc.data();
  const modulosHabilitados = userData?.modulos_habilitados || {};
  
  // Usar la función auxiliar para inicializar módulos del nuevo curso
  const courseModules = await initializeCourseModules(id_curso);
  const updatedModulosHabilitados = { ...modulosHabilitados, ...courseModules };

  // Actualizar módulos habilitados en el usuario
  await userDoc.ref.update({ modulos_habilitados: updatedModulosHabilitados });

  return res.status(200).json({ message: 'Curso asignado al usuario' });
};

// Obtener el estado de habilitación de módulos para un estudiante
export const getStudentModules = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user.uid;

    // Verificar que el usuario solicitante sea el mismo que el usuario consultado, o sea admin
    const requestingUserDoc = await firestore.collection('users').doc(requestingUserId).get();
    const requestingUserData = requestingUserDoc.data();
    const isAdmin = requestingUserData?.role?.admin === true;

    // Si no es admin y no es el mismo usuario, denegar acceso
    if (!isAdmin && requestingUserId !== id) {
      return res.status(403).json({
        error: "No autorizado. Solo puedes ver tus propios módulos habilitados.",
      });
    }

    const targetUserDoc = await firestore.collection('users').doc(id).get();

    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const targetUserData = targetUserDoc.data();
    const modulosHabilitados = targetUserData?.modulos_habilitados || {};

    return res.status(200).json({ modulos_habilitados: modulosHabilitados });
  } catch (error) {
    console.error('Error fetching student modules:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar el estado de habilitación de un módulo para un estudiante
// Marcar contenido como completado
export const markContentAsCompleted = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // ID del estudiante
    const { moduleId, contentIndex, contentType, completed } = req.body; // contentType: 'video' | 'document'

    // Verificar que el usuario autenticado sea el mismo que el estudiante o sea admin
    const isAdmin = await validateUser(req);
    if (!isAdmin && req.user.uid !== id) {
      return res.status(403).json({ error: 'No autorizado para actualizar este contenido' });
    }

    // Obtener el documento del usuario
    const userDoc = await firestore.collection('users').doc(id).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    
    // Inicializar el objeto de progreso si no existe
    const progreso = userData?.progreso || {};
    const moduleProgreso = progreso[moduleId] || {};
    
    // Crear clave única para el contenido (moduleId + contentType + index)
    const contentKey = `${moduleId}_${contentType}_${contentIndex}`;
    
    // Actualizar el estado de completado
    moduleProgreso[contentKey] = completed === true;
    
    // Guardar el progreso actualizado
    await firestore.collection('users').doc(id).update({
      progreso: {
        ...progreso,
        [moduleId]: moduleProgreso
      }
    });

    return res.status(200).json({ 
      message: 'Contenido marcado como completado',
      completed: completed === true
    });
  } catch (error: any) {
    console.error('Error al marcar contenido como completado:', error);
    return res.status(500).json({ error: 'Error al actualizar el progreso' });
  }
};

// Obtener progreso del estudiante
export const getStudentProgress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params; // ID del estudiante

    // Verificar que el usuario autenticado sea el mismo que el estudiante o sea admin
    const isAdmin = await validateUser(req);
    if (!isAdmin && req.user.uid !== id) {
      return res.status(403).json({ error: 'No autorizado para ver este progreso' });
    }

    // Obtener el documento del usuario
    const userDoc = await firestore.collection('users').doc(id).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    const progreso = userData?.progreso || {};

    return res.status(200).json({ progreso });
  } catch (error: any) {
    console.error('Error al obtener progreso:', error);
    return res.status(500).json({ error: 'Error al obtener el progreso' });
  }
};

export const updateStudentModule = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
      return res.status(403).json({
        error: "No autorizado. Se requieren permisos de administrador.",
      });
    }

    const { id, moduleId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'El campo "enabled" debe ser un booleano' });
    }

    const userDoc = await firestore.collection('users').doc(id).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    const modulosHabilitados = userData?.modulos_habilitados || {};

    // Actualizar el estado del módulo específico
    modulosHabilitados[moduleId] = enabled;

    // Actualizar en Firestore
    await userDoc.ref.update({
      modulos_habilitados: modulosHabilitados,
      fechaActualizacion: new Date(),
    });

    return res.status(200).json({
      message: `Módulo ${enabled ? 'habilitado' : 'deshabilitado'} exitosamente`,
      modulos_habilitados: modulosHabilitados,
    });
  } catch (error) {
    console.error('Error updating student module:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};



