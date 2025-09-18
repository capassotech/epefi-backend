// src/modules/auth/controller.ts
import type { Request, Response } from "express";
import { firebaseAuth, firestore } from "../../config/firebase";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware";
import type {
  UserRegistrationData,
  LoginData,
  UpdateProfileData,
} from "../../types/user";
import {
  validateUser,
  getUserData,
  isValidEmail,
  isValidDNI,
  handleControllerError,
} from "../../utils/utils";
import crypto from "crypto";

const usersCollection = firestore.collection("users");
const tokensCollection = firestore.collection("reset_tokens");

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, apellido, dni }: UserRegistrationData =
      req.body;

    // Convertir DNI a string para consistencia
    const dniString = typeof dni === "string" ? dni.trim() : String(dni).trim();

    // Verificar si el usuario ya existe en Firebase Auth (CORREGIDO para Admin SDK)
    try {
      const existingUser = await firebaseAuth.getUserByEmail(
        email.toLowerCase()
      );
      // Si llegamos aquí, el usuario YA existe
      return res.status(409).json({
        error: "El email ya está registrado",
      });
    } catch (error: any) {
      // En Admin SDK, si el usuario no existe, lanza error auth/user-not-found
      if (error.code !== "auth/user-not-found") {
        console.error("Error checking existing user:", error);
        return res.status(500).json({
          error: "Error interno al verificar usuario existente",
        });
      }
      // Si es auth/user-not-found, está bien, continuamos
    }

    // Verificar si el DNI ya existe en Firestore
    const existingDniQuery = await usersCollection
      .where("dni", "==", dniString)
      .get();

    if (!existingDniQuery.empty) {
      return res.status(409).json({
        error: "El DNI ya está registrado",
      });
    }

    // Crear usuario en Firebase Auth (CORREGIDO para Admin SDK)
    const userRecord = await firebaseAuth.createUser({
      email: email.toLowerCase(),
      password: password,
      displayName: `${nombre} ${apellido}`,
    });

    // Definir rol por defecto (estudiante)
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

    // NOTA: generateEmailVerificationLink requiere configuración adicional en Admin SDK
    // Por ahora comentamos esto
    /*
    try {
      await firebaseAuth.generateEmailVerificationLink(email.toLowerCase());
    } catch (emailError) {
      console.warn("No se pudo enviar email de verificación:", emailError);
    }
    */

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: {
        uid: userRecord.uid,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        role: userData.role,
      },
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

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginData = req.body;

    // Firebase Auth maneja la autenticación en el cliente
    // Aquí solo verificamos que el usuario existe y está activo en Firestore
    let userRecord;
    try {
      userRecord = await firebaseAuth.getUserByEmail(email.toLowerCase());
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        return res.status(401).json({
          error: "Credenciales inválidas",
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
      message: "Información de usuario verificada",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        role: userData.role,
        emailVerificado: userRecord.emailVerified,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return res.status(500).json({
      error: "Error interno del servidor durante el login",
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
        role: userData?.role,
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

    // Aquí podrías integrar con un servicio de email como SendGrid, SES, etc.
    // Por ahora solo loggeamos el link
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

    // Para cambio de contraseña, Firebase requiere reautenticación del usuario
    // En el frontend se debe hacer la reautenticación antes de llamar este endpoint

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

    // El refresh del token se maneja en el frontend con Firebase
    return res.status(200).json({
      message: "Token válido, usuario activo",
      user: {
        uid: uid,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        role: userData.role,
      },
    });
  } catch (error: any) {
    console.error("Refresh token error:", error);
    return res.status(500).json({
      error: "Error al verificar token",
    });
  }
};
