import type { Request, Response } from "express";
import { firebaseAuth, firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type {
  UserRegistrationData,
  LoginData,
  UpdateProfileData,
  FirebaseAuthResponse,
} from "../../types/user";
import {
  validateUser,
  getUserData,
  isValidEmail,
  isValidDNI,
  handleControllerError,
} from "../../utils/utils";

const usersCollection = firestore.collection("users");

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, apellido, dni }: UserRegistrationData =
      req.body;

    // Convertir DNI a string para consistencia
    const dniString = typeof dni === "string" ? dni.trim() : String(dni).trim();

    // Verificar si el DNI ya existe en Firestore
    const existingDniQuery = await usersCollection
      .where("dni", "==", dniString)
      .get();

    if (!existingDniQuery.empty) {
      return res.status(409).json({
        error: "El DNI ya está registrado",
      });
    }

    // Crear usuario en Firebase Auth
    const userRecord = await firebaseAuth.createUser({
      email: email.toLowerCase(),
      password: password,
      displayName: `${nombre} ${apellido}`,
    });

    // Definir rol por defecto
    const userRole = {
      admin: false,
      student: true,
    };

    // Crear documento de usuario en Firestore
    const userData = {
      uid: userRecord.uid,
      email: email.toLowerCase(),
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      dni: dniString,
      role: userRole,
      activo: true,
      fechaCreacion: new Date(),
      fechaRegistro: new Date(),
      emailVerificado: false,
    };

    await usersCollection.doc(userRecord.uid).set(userData);

    // Generar token personalizado para respuesta inmediata
    const customToken = await firebaseAuth.createCustomToken(userRecord.uid);

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: {
        uid: userRecord.uid,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        dni: userData.dni,
        role: userData.role,
      },
      customToken,
    });
  } catch (error: any) {
    console.error("Register error:", error);

    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({
        error: "El email ya está registrado",
      });
    }

    if (error.code === "auth/weak-password") {
      return res.status(400).json({
        error: "La contraseña es demasiado débil",
      });
    }

    return res.status(500).json({
      error: "Error interno del servidor durante el registro",
    });
  }
};

// En tu auth/controller.ts
export const login = async (req: Request, res: Response) => {
  try {
    const { email } = req.body; // Solo necesitas el email para verificar

    console.log("🔍 Login verification for:", email);

    // NO hagas autenticación aquí - ya se hizo en el frontend
    // Solo verifica que el usuario existe en Firestore
    let userRecord;
    try {
      userRecord = await firebaseAuth.getUserByEmail(email.toLowerCase());
      console.log("✅ User found in Firebase:", userRecord.uid);
    } catch (error: any) {
      console.log("❌ Firebase error:", error.code);
      if (error.code === "auth/user-not-found") {
        return res.status(401).json({
          error: "Usuario no encontrado",
        });
      }
      throw error;
    }

    // Obtener datos adicionales de Firestore
    const userDoc = await usersCollection.doc(userRecord.uid).get();

    if (!userDoc.exists) {
      return res.status(401).json({
        error: "Usuario no encontrado en la base de datos",
      });
    }

    const userData = userDoc.data();

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Cuenta desactivada. Contacte al administrador",
      });
    }

    // Actualizar último acceso
    await usersCollection.doc(userRecord.uid).update({
      fechaUltimoAcceso: new Date(),
    });

    return res.status(200).json({
      message: "Usuario verificado correctamente",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        dni: userData.dni,
        role: userData.role,
        emailVerificado: userRecord.emailVerified,
        fechaRegistro: userData.fechaRegistro || userData.fechaCreacion,
      },
    });
  } catch (error: any) {
    console.error("Login verification error:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};
export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uid } = req.user;

    // Revocar todos los tokens del usuario
    await firebaseAuth.revokeRefreshTokens(uid);

    // Actualizar última actividad
    await usersCollection.doc(uid).update({
      fechaUltimaActividad: new Date(),
    });

    return res.status(200).json({
      message: "Sesión cerrada exitosamente",
    });
  } catch (error: any) {
    console.error("Logout error:", error);
    return res.status(500).json({
      error: "Error al cerrar sesión",
    });
  }
};

export const verifyToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: "Token requerido",
      });
    }

    // Verificar token con Firebase
    const decodedToken = await firebaseAuth.verifyIdToken(token);

    // Obtener datos de usuario de Firestore
    const userDoc = await usersCollection.doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const userData = userDoc.data();

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Cuenta desactivada",
      });
    }

    return res.status(200).json({
      valid: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        nombre: userData?.nombre,
        apellido: userData?.apellido,
        dni: userData?.dni,
        role: userData?.role,
        fechaRegistro: userData?.fechaRegistro || userData?.fechaCreacion,
      },
    });
  } catch (error: any) {
    console.error("Verify token error:", error);

    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({
        valid: false,
        error: "Token expirado",
      });
    }

    return res.status(401).json({
      valid: false,
      error: "Token inválido",
    });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Verificar que el usuario existe
    try {
      await firebaseAuth.getUserByEmail(email.toLowerCase());
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        // Por seguridad, no revelamos si el email existe
        return res.status(200).json({
          message:
            "Si el email existe, se enviarán instrucciones de restablecimiento",
        });
      }
      throw error;
    }

    // Generar link de reset usando Firebase
    const resetLink = await firebaseAuth.generatePasswordResetLink(
      email.toLowerCase(),
      {
        url: `${process.env.FRONTEND_URL}/reset-password`,
      }
    );

    console.log(`Password reset link for ${email}: ${resetLink}`);

    return res.status(200).json({
      message:
        "Si el email existe, se enviarán instrucciones de restablecimiento",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return res.status(500).json({
      error: "Error al procesar solicitud de restablecimiento",
    });
  }
};

export const changePassword = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { uid } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Verificar permisos: solo admin o el mismo usuario
    if (req.user.uid !== uid && !(await validateUser(req))) {
      return res.status(403).json({
        error: "No tienes permisos para cambiar esta contraseña",
      });
    }

    // Actualizar contraseña en Firebase
    await firebaseAuth.updateUser(uid, {
      password: newPassword,
    });

    // Registrar cambio en Firestore
    await usersCollection.doc(uid).update({
      fechaUltimoCambioPassword: new Date(),
      fechaActualizacion: new Date(),
    });

    // Revocar todos los tokens para forzar nuevo login
    await firebaseAuth.revokeRefreshTokens(uid);

    return res.status(200).json({
      message: "Contraseña cambiada exitosamente. Inicie sesión nuevamente",
    });
  } catch (error: any) {
    console.error("Change password error:", error);

    if (error.code === "auth/user-not-found") {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.status(500).json({
      error: "Error al cambiar contraseña",
    });
  }
};

export const refreshToken = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { uid } = req.user;

    // Verificar que el usuario sigue activo
    const userDoc = await usersCollection.doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    const userData = userDoc.data();

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Cuenta desactivada",
      });
    }

    // Actualizar última actividad
    await usersCollection.doc(uid).update({
      fechaUltimaActividad: new Date(),
    });

    // Generar nuevo token personalizado
    const customToken = await firebaseAuth.createCustomToken(uid, {
      role: userData.role,
      email: userData.email,
    });

    return res.status(200).json({
      message: "Token válido, usuario activo",
      customToken,
      user: {
        uid: uid,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        dni: userData.dni,
        role: userData.role,
        fechaRegistro: userData.fechaRegistro || userData.fechaCreacion,
      },
    });
  } catch (error: any) {
    console.error("Refresh token error:", error);
    return res.status(500).json({
      error: "Error al verificar token",
    });
  }
};
