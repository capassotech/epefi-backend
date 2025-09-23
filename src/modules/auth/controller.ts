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

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginData = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email y contraseña son requeridos",
      });
    }

    // Validar formato de email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Formato de email inválido",
      });
    }

    // Usar la API REST de Firebase Auth (igual que en tu código que funciona)
    const firebaseApiKey = process.env.FIREBASE_API_KEY; // Mueve esto a variable de entorno

    console.log(`Intentando login para email: ${email}`);

    try {
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );

      const authResult = (await response.json()) as FirebaseAuthResponse;

      console.log(`Response status: ${response.status}`);
      console.log(`Auth result:`, {
        localId: authResult.localId ? "[PRESENTE]" : "[AUSENTE]",
        // No loggear tokens por seguridad
        idToken: authResult.idToken ? "[PRESENTE]" : "[AUSENTE]",
        refreshToken: authResult.refreshToken ? "[PRESENTE]" : "[AUSENTE]",
        error: authResult.error ? authResult.error.message : "[SIN ERROR]",
      });

      if (!response.ok) {
        console.error(`Error de Firebase Auth:`, authResult.error);

        // Manejar errores específicos de Firebase Auth
        if (authResult.error?.message === "EMAIL_NOT_FOUND") {
          console.log(`Usuario no encontrado: ${email}`);
          return res.status(401).json({
            error: "Credenciales inválidas",
          });
        }
        if (authResult.error?.message === "INVALID_PASSWORD") {
          console.log(`Contraseña incorrecta para: ${email}`);
          return res.status(401).json({
            error: "Credenciales inválidas",
          });
        }
        if (authResult.error?.message === "USER_DISABLED") {
          console.log(`Usuario deshabilitado: ${email}`);
          return res.status(403).json({
            error: "Usuario deshabilitado",
          });
        }
        if (authResult.error?.message === "TOO_MANY_ATTEMPTS_TRY_LATER") {
          console.log(`Demasiados intentos para: ${email}`);
          return res.status(429).json({
            error: "Demasiados intentos fallidos. Intente más tarde",
          });
        }

        return res.status(401).json({
          error: "Credenciales inválidas",
          details:
            process.env.NODE_ENV === "development"
              ? authResult.error?.message
              : undefined,
        });
      }

      // Si llegamos aquí, las credenciales son válidas
      const uid = authResult.localId;

      if (!uid) {
        console.error("No se obtuvo UID de Firebase Auth");
        return res.status(500).json({
          error: "Error interno de autenticación",
        });
      }

      console.log(`Login exitoso para UID: ${uid}`);

      // Verificar datos adicionales en Firestore
      const userDoc = await usersCollection.doc(uid).get();

      if (!userDoc.exists) {
        console.error(`Usuario ${uid} no encontrado en Firestore`);
        return res.status(404).json({
          error: "Usuario no encontrado en el sistema",
        });
      }

      const userData = userDoc.data();

      // Verificar que el usuario esté activo
      if (!userData?.activo) {
        console.log(`Usuario ${uid} está desactivado`);
        return res.status(403).json({
          error: "Usuario desactivado. Contacte al administrador",
        });
      }

      // Actualizar último acceso
      await usersCollection.doc(uid).update({
        fechaUltimoAcceso: new Date(),
      });

      // Generar token personalizado para el sistema
      const customToken = await firebaseAuth.createCustomToken(uid);
      console.log(`Token personalizado generado para UID: ${uid}`);

      return res.json({
        message: "Login exitoso",
        customToken,
        user: {
          uid,
          email: userData.email,
          nombre: userData.nombre,
          apellido: userData.apellido,
          dni: userData.dni,
          role: userData.role,
          ultimoLogin: new Date(),
        },
      });
    } catch (fetchError: any) {
      console.error("Error en la petición a Firebase Auth:", fetchError);

      if (
        fetchError.name === "TypeError" &&
        fetchError.message.includes("fetch")
      ) {
        return res.status(503).json({
          error: "Error de conectividad con el servicio de autenticación",
        });
      }

      return res.status(401).json({
        error: "Error validando credenciales",
        details:
          process.env.NODE_ENV === "development"
            ? fetchError.message
            : undefined,
      });
    }
  } catch (error: any) {
    console.error("Error general en login:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
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
