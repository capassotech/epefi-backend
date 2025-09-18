// src/utils/utils.ts
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { firestore } from "../config/firebase";

export interface UserRole {
  admin: boolean;
  student: boolean;
}

export interface UserData {
  uid: string;
  email: string;
  nombre: string;
  apellido: string;
  dni?: string;
  role: UserRole;
  activo: boolean;
  fechaCreacion: Date;
  fechaUltimoAcceso?: Date;
}

/**
 * Valida si el usuario tiene permisos de administrador
 * CORREGIDO: Cambiado de "usuarios" a "users" y de "rol" a "role.admin"
 */
export const validateUser = async (
  req: AuthenticatedRequest
): Promise<boolean> => {
  try {
    if (!req.user || !req.user.uid) {
      console.warn("validateUser: No user information in request");
      return false;
    }

    // CORREGIDO: usar "users" en lugar de "usuarios"
    const usersCollection = firestore.collection("users");
    const userDoc = await usersCollection.doc(req.user.uid).get();

    if (!userDoc.exists) {
      console.warn(`validateUser: User ${req.user.uid} not found in database`);
      return false;
    }

    const userData = userDoc.data() as UserData;

    // Verificar si el usuario está activo
    if (!userData.activo) {
      console.warn(`validateUser: User ${req.user.uid} is inactive`);
      return false;
    }

    // CORREGIDO: usar userData.role.admin en lugar de userData.rol === "admin"
    if (!userData.role || !userData.role.admin) {
      console.warn(
        `validateUser: User ${req.user.uid} does not have admin role`
      );
      return false;
    }

    // Actualizar fecha de último acceso
    await usersCollection.doc(req.user.uid).update({
      fechaUltimoAcceso: new Date(),
    });

    return true;
  } catch (error) {
    console.error("validateUser error:", error);
    return false;
  }
};

/**
 * REMOVIDO: validateInstructor ya que solo tenemos admin y student
 */

/**
 * Obtiene la información completa del usuario
 */
export const getUserData = async (uid: string): Promise<UserData | null> => {
  try {
    const usersCollection = firestore.collection("users");
    const userDoc = await usersCollection.doc(uid).get();

    if (!userDoc.exists) {
      return null;
    }

    return userDoc.data() as UserData;
  } catch (error) {
    console.error("getUserData error:", error);
    return null;
  }
};

/**
 * Formatea una fecha a string ISO
 */
export const formatDate = (date: Date): string => {
  return date.toISOString();
};

/**
 * Valida formato de email
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valida formato de DNI argentino
 */
export const isValidDNI = (dni: string | number): boolean => {
  const dniStr = typeof dni === "string" ? dni.trim() : dni.toString();

  // Debe tener entre 7 y 8 dígitos
  if (!/^\d{7,8}$/.test(dniStr)) {
    return false;
  }

  // No debe ser un DNI obviamente falso
  const invalidDnis = [
    "00000000",
    "11111111",
    "22222222",
    "33333333",
    "44444444",
    "55555555",
    "66666666",
    "77777777",
    "88888888",
    "99999999",
    "12345678",
  ];

  return !invalidDnis.includes(dniStr.padStart(8, "0"));
};

/**
 * Sanitiza una cadena de texto - MEJORADO
 */
export const sanitizeString = (str: string): string => {
  if (typeof str !== "string") return "";

  return str
    .trim()
    .replace(/\s+/g, " ") // Reemplazar múltiples espacios por uno solo
    .replace(/[\x00-\x1f\x7f-\x9f]/g, "") // Remover caracteres de control
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remover scripts
    .slice(0, 1000); // Limitar longitud
};

/**
 * Verifica si un usuario puede acceder a un recurso específico
 */
export const canAccessResource = async (
  req: AuthenticatedRequest,
  resourceOwnerUid?: string
): Promise<boolean> => {
  try {
    // Los administradores pueden acceder a todo
    if (await validateUser(req)) {
      return true;
    }

    // Si no hay propietario específico, solo admins pueden acceder
    if (!resourceOwnerUid) {
      return false;
    }

    // Los usuarios pueden acceder a sus propios recursos
    return req.user.uid === resourceOwnerUid;
  } catch (error) {
    console.error("canAccessResource error:", error);
    return false;
  }
};

/**
 * Convierte fechas de Firestore a formato ISO string para respuestas API
 */
export const formatFirestoreDoc = (doc: any): any => {
  const data = doc.data();
  if (!data) return null;

  const formatted: Record<string, any> = { id: doc.id };

  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === "object" &&
      value !== null &&
      "toDate" in value
    ) {
      // Es un Timestamp de Firestore
      const timestamp = value as { toDate: () => Date };
      formatted[key] = timestamp.toDate().toISOString();
    } else {
      formatted[key] = value;
    }
  }

  return formatted;
};

/**
 * Manejo de errores estándar para controladores
 */
export const handleControllerError = (
  error: any,
  res: any,
  operation: string,
  defaultMessage: string = "Error interno del servidor"
): void => {
  console.error(`${operation} error:`, error);

  // Errores de validación de Firestore
  if (error.code === "not-found") {
    res.status(404).json({ error: "Recurso no encontrado" });
    return;
  }

  if (error.code === "permission-denied") {
    res.status(403).json({ error: "Permisos insuficientes" });
    return;
  }

  if (error.code === "invalid-argument") {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }

  // Error genérico
  res.status(500).json({ error: defaultMessage });
};
