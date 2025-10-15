import { Request, Response } from 'express';
import { firebaseAuth, firestore } from '../../config/firebase';
import { ValidatedUpdateUser, ValidatedUser } from '../../types/schemas';
import { validateUser } from '../../utils/utils';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

export const getUserProfile = async (req: any, res: Response) => {
  const uid = req.user.uid;
  const userDoc = await firestore.collection('users').doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  return res.json(userDoc.data());
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

    await userDoc.ref.delete();

    return res.status(200).json({
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
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



