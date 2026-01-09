import { Request, Response } from 'express';
import { firebaseAuth, firestore } from '../../config/firebase';
import { ValidatedUpdateUser, ValidatedUser, ValidatedUpdateProfile } from '../../types/schemas';
import { validateUser } from '../../utils/utils';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

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

  return res.json(userDoc.data());
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
    
    const userDoc = await firestore.collection("users").doc(userRecord.uid).set({ email, nombre, apellido, dni, role, activo, cursos_asignados, emailVerificado });
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
    
    const userDoc = await firestore.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (updateData.cursos_asignados && updateData.cursos_asignados.length > 0) {
      for (const cursoId of updateData.cursos_asignados) {
        const cursoDoc = await firestore.collection('cursos').doc(cursoId).get();
        if (!cursoDoc.exists) {
          return res.status(404).json({ error: 'Curso no encontrado' });
        }
      }
    }

    await userDoc.ref.update(updateData);

    const updatedDoc = await firestore.collection('users').doc(uid).get();

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

  await userDoc.ref.update({ cursos_asignados: [...userDoc.data()?.cursos_asignados || [], id_curso] });
  return res.status(200).json({ message: 'Curso asignado al usuario' });
};

// Obtener el estado de habilitación de módulos para un estudiante
export const getStudentModules = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAuthorized = await validateUser(req);
    if (!isAuthorized) {
      return res.status(403).json({
        error: "No autorizado. Se requieren permisos de administrador.",
      });
    }

    const { id } = req.params;
    const userDoc = await firestore.collection('users').doc(id).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userData = userDoc.data();
    const modulosHabilitados = userData?.modulos_habilitados || {};

    return res.status(200).json({ modulos_habilitados: modulosHabilitados });
  } catch (error) {
    console.error('Error fetching student modules:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar el estado de habilitación de un módulo para un estudiante
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



