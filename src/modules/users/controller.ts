import { Request, Response } from "express";
import { firestore } from "../../config/firebase";

export const getUserProfile = async (req: any, res: Response) => {
  const uid = req.user.uid;
  const userDoc = await firestore.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  return res.json(userDoc.data());
};

// Agregarle membresia al usuario
export const addMembershipToUser = async (req: any, res: Response) => {
  const { uid, membershipId } = req.body;
  const userDoc = await firestore.collection("users").doc(uid).get();
  const membershipDoc = await firestore
    .collection("membresias")
    .doc(membershipId)
    .get();
  if (!userDoc.exists) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }
  if (!membershipDoc.exists) {
    return res.status(404).json({ error: "Membresía no encontrada" });
  }

  await userDoc.ref.update({ membresia_id: membershipId });
  return res.status(200).json({ message: "Membresía agregada al usuario" });
};

export const getUser = async (req: any, res: Response) => {
  const uid = req.params.id;
  const userDoc = await firestore.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  return res.json(userDoc.data());
};

export const getUsers = async (req: any, res: Response) => {
  try {
    const userDocs = await firestore.collection("users").get();

    const users = userDocs.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`Found ${users.length} registered users`);

    return res.json(users);
  } catch (error) {
    console.error("Error fetching registered users:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const deleteUser = async (req: any, res: Response) => {
  try {
    const uid = req.params.id;
    const userDoc = await firestore.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    await userDoc.ref.delete();

    return res.status(200).json({
      message: "Usuario eliminado correctamente",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const updateUser = async (req: any, res: Response) => {
  try {
    const uid = req.params.id;
    const userDoc = await firestore.collection("users").doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    await userDoc.ref.update(req.body);

    const updatedDoc = await firestore.collection("users").doc(uid).get();

    return res.status(200).json({
      message: "Usuario actualizado correctamente",
      user: {
        id: updatedDoc.id,
        ...updatedDoc.data(),
      },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const testVocacional = async (req: any, res: Response) => {
  const { uid, responses }: { uid: string; responses: string[] } = req.body;
  if (!uid || !responses) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  if (responses.length > 5) {
    return res.status(400).json({ error: "Cantidad de respuestas inválida" });
  }

  const userDoc = await firestore.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  let counterA = 0;
  let counterB = 0;
  let counterC = 0;
  for (const response of responses) {
    if (response.toLowerCase() === "a") counterA++;
    else if (response.toLowerCase() === "b") counterB++;
    else if (response.toLowerCase() === "c") counterC++;
  }

  let rutaAprendizaje: string;
  if (counterA > counterB && counterA > counterC)
    rutaAprendizaje = "consultoria";
  else if (counterB > counterA && counterB > counterC)
    rutaAprendizaje = "liderazgo";
  else if (counterC > counterA && counterC > counterB)
    rutaAprendizaje = "emprendimiento";
  else if (counterA === counterB) rutaAprendizaje = "consultor-lider";
  else if (counterB === counterC) rutaAprendizaje = "lider-emprendedor";
  else if (counterC === counterA) rutaAprendizaje = "emprendedor-consultor";
  else rutaAprendizaje = "consultoria";

  await userDoc.ref.update({ ruta_aprendizaje: rutaAprendizaje });

  const ruta = await firestore
    .collection("rutas_aprendizaje")
    .doc(rutaAprendizaje)
    .get();

  return res.status(200).json({
    success: true,
    ruta: {
      id: ruta.id,
      ...ruta.data(),
    },
  });
};
