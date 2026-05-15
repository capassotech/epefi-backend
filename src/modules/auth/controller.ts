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
import {
  getPasswordValidationErrors,
  PASSWORD_POLICY_MESSAGE,
} from "../../utils/passwordValidator";

const usersCollection = firestore.collection("users");

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, apellido, dni }: UserRegistrationData =
      req.body;
    const passwordErrors = getPasswordValidationErrors(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: "Datos de registro inválidos",
        details: passwordErrors,
      });
    }

    // Verificar si el DNI ya existe
    const existingDniQuery = await firestore
      .collection("users")
      .where("dni", "==", dni)
      .get();

    if (!existingDniQuery.empty) {
      return res.status(409).json({
        error: "Ya existe un usuario registrado con este DNI",
      });
    }

    // Crear usuario en Firebase Auth
    const userRecord = await firebaseAuth.createUser({
      email,
      password,
      displayName: `${nombre} ${apellido}`,
    });

    console.log("userRecord", userRecord);

    // Crear perfil de usuario en Firestore
    const userData = {
      email,
      nombre,
      apellido,
      dni,
      role: {
        admin: false,
        student: true,
      },
      fechaRegistro: new Date(),
      fechaActualizacion: new Date(),
      activo: true,
    };

    await firestore.collection("users").doc(userRecord.uid).set(userData);

    // Generar token personalizado para respuesta inmediata
    const customToken = await firebaseAuth.createCustomToken(userRecord.uid);

    console.log("customToken", customToken);

    return res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        nombre,
        apellido,
        dni,
        role: userData.role,
      },
      customToken,
    });
  } catch (error: any) {
    console.error("Error en registro:", error);

    if (error.code === "auth/email-already-exists") {
      return res.status(409).json({
        error: "Ya existe un usuario registrado con este email",
      });
    }

    if (error.code === "auth/invalid-email") {
      return res.status(400).json({
        error: "Formato de email inválido",
      });
    }

    if (error.code === "auth/weak-password") {
      return res.status(400).json({
        error: "La contraseña es muy débil",
      });
    }

    return res.status(500).json({
      error: "Error interno del servidor",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    console.log("🔍 Login verification for:", email);

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

    const userDoc = await usersCollection.doc(userRecord.uid).get();

    console.log("userDoc", userDoc);

    if (!userDoc.exists) {
      return res.status(401).json({
        error: "Usuario no encontrado en la base de datos",
      });
    }

    const userData = userDoc.data();

    console.log("userData", userData);

    if (!userData?.activo) {
      return res.status(403).json({
        error: "Cuenta desactivada. Contacte al administrador",
      });
    }

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
        activo: userData.activo !== undefined ? userData.activo : true,
      },
    });
  } catch (error: any) {
    console.error("Login verification error:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const createGoogleUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uid } = req.user;
    const firebaseUser = await firebaseAuth.getUser(uid);

    // Verificar si el usuario ya existe en Firestore
    const userDoc = await usersCollection.doc(uid).get();

    if (userDoc.exists) {
      // Si ya existe, devolver los datos existentes
      const userData = userDoc.data();
        return res.status(200).json({
          message: "Usuario ya existe",
          user: {
            uid: uid,
            email: firebaseUser.email,
            nombre: userData?.nombre || "",
            apellido: userData?.apellido || "",
            dni: userData?.dni || "",
            role: userData?.role || { admin: false, student: true },
            emailVerificado: firebaseUser.emailVerified,
            fechaRegistro: userData?.fechaRegistro || userData?.fechaCreacion || new Date(),
            activo: userData?.activo !== undefined ? userData.activo : true,
          },
        });
    }

    // Extraer nombre y apellido del displayName
    const displayName = firebaseUser.displayName || "";
    const nameParts = displayName.split(" ");
    const nombre = nameParts[0] || "";
    const apellido = nameParts.slice(1).join(" ") || "";

    // Crear perfil de usuario en Firestore
    const userData = {
      email: firebaseUser.email || "",
      nombre: nombre,
      apellido: apellido,
      dni: "", // DNI vacío para usuarios de Google, se puede actualizar después
      role: {
        admin: false,
        student: true,
      },
      fechaRegistro: new Date(),
      fechaActualizacion: new Date(),
      activo: true,
      emailVerificado: firebaseUser.emailVerified,
      cursos_asignados: [],
    };

    await usersCollection.doc(uid).set(userData);

    return res.status(201).json({
      message: "Usuario creado exitosamente",
      user: {
        uid: uid,
        email: userData.email,
        nombre: userData.nombre,
        apellido: userData.apellido,
        dni: userData.dni,
        role: userData.role,
        emailVerificado: userData.emailVerificado,
        fechaRegistro: userData.fechaRegistro,
        activo: userData.activo,
      },
    });
  } catch (error: any) {
    console.error("Error creating Google user:", error);
    return res.status(500).json({
      error: "Error al crear usuario",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uid } = req.user;

    await firebaseAuth.revokeRefreshTokens(uid);

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
    const passwordErrors = getPasswordValidationErrors(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: "Datos inválidos",
        details: passwordErrors,
      });
    }

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

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { oobCode, newPassword } = req.body as {
      oobCode: string;
      newPassword: string;
    };

    const passwordErrors = getPasswordValidationErrors(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: "Datos inválidos",
        details: passwordErrors,
      });
    }

    const firebaseWebAPIKey = process.env.FIREBASE_WEB_API_KEY;
    if (!firebaseWebAPIKey) {
      return res.status(500).json({
        error: "Configuración de Firebase incompleta",
      });
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${firebaseWebAPIKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oobCode,
          newPassword,
        }),
      }
    );

    const payload = (await response.json()) as {
      error?: { message?: string };
    };

    if (!response.ok) {
      const code = payload?.error?.message || "RESET_FAILED";
      if (code === "INVALID_OOB_CODE" || code === "EXPIRED_OOB_CODE") {
        return res.status(400).json({
          error: "Código de restablecimiento inválido o expirado",
        });
      }
      if (code === "WEAK_PASSWORD") {
        return res.status(400).json({
          error: PASSWORD_POLICY_MESSAGE,
        });
      }
      return res.status(400).json({
        error: "No se pudo restablecer la contraseña",
      });
    }

    return res.status(200).json({
      message: "Contraseña restablecida exitosamente",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return res.status(500).json({
      error: "Error al restablecer la contraseña",
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

// ENDPOINT ESPECIAL PARA OBTENER ID TOKEN DESDE CUSTOM TOKEN (PARA TESTING)
export const getIdToken = async (req: Request, res: Response) => {
  try {
    const { customToken } = req.body;

    if (!customToken) {
      return res.status(400).json({
        error: "Custom token requerido en el body"
      });
    }

    console.log("🔄 Convirtiendo custom token a ID token...");
    console.log("📥 Custom token recibido:", customToken);

    // Usar la API de Firebase para convertir custom token a ID token
    const firebaseWebAPIKey = process.env.FIREBASE_WEB_API_KEY;
    
    if (!firebaseWebAPIKey) {
      console.error("❌ FIREBASE_WEB_API_KEY no configurada en variables de entorno");
      return res.status(500).json({
        error: "Configuración de Firebase incompleta",
        instructions: {
          message: "Agrega FIREBASE_WEB_API_KEY a tus variables de entorno",
          where: "Firebase Console > Project Settings > General > Web API Key"
        }
      });
    }

    // Hacer request a Firebase REST API
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseWebAPIKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: customToken,
          returnSecureToken: true
        })
      }
    );

    const firebaseResponse = await response.json() as any;

    if (!response.ok) {
      console.error("❌ Error de Firebase:", firebaseResponse);
      return res.status(400).json({
        error: "Error al convertir custom token",
        details: firebaseResponse.error?.message || "Token inválido"
      });
    }

    const idToken = firebaseResponse.idToken;
    const refreshToken = firebaseResponse.refreshToken;

    console.log("✅ ID Token generado exitosamente");
    console.log("🔑 ID Token:", idToken);
    console.log("🔄 Refresh Token:", refreshToken);

    return res.status(200).json({
      message: "ID Token generado exitosamente",
      idToken: idToken,
      refreshToken: refreshToken,
      expiresIn: firebaseResponse.expiresIn,
      usage: {
        header: "Authorization",
        value: `Bearer ${idToken}`,
        example: "Authorization: Bearer " + idToken
      },
      testInPostman: {
        step1: "Copia el idToken de arriba",
        step2: "En Postman, ve a Headers",
        step3: "Agrega: Authorization = Bearer [TU_ID_TOKEN]",
        step4: "Haz requests a endpoints protegidos"
      }
    });

  } catch (error: any) {
    console.error("❌ Error en getIdToken:", error);
    return res.status(500).json({
      error: "Error interno al generar ID token",
      details: error.message
    });
  }
};
