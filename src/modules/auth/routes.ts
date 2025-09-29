// src/modules/auth/routes.ts (FIXED VERSION)
import { Router, Request, Response } from "express";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../../middleware/authMiddleware";
import {
  register,
  login,
  logout,
  verifyToken,
  forgotPassword,
  changePassword,
  refreshToken,
  getIdToken,
} from "./controller";
import {
  validateRequest,
  validateRegistration,
  validateLogin,
  sanitizeInput,
  trackLoginResult,
} from "../../middleware/validation";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  changePasswordSchema,
} from "./validation";

const router = Router();

// Wrappers para manejar AuthenticatedRequest correctamente
const logoutHandler = (req: Request, res: Response) => {
  return logout(req as AuthenticatedRequest, res);
};

const refreshTokenHandler = (req: Request, res: Response) => {
  return refreshToken(req as AuthenticatedRequest, res);
};

const changePasswordHandler = (req: Request, res: Response) => {
  return changePassword(req as AuthenticatedRequest, res);
};

// ========== RUTAS PÚBLICAS ==========

/**
 * @route   POST /api/auth/register
 * @desc    Registrar nuevo usuario
 * @access  Public
 */
router.post("/register", sanitizeInput, validateRegistration, register);

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesión
 * @access  Public
 */
router.post("/login", sanitizeInput, validateLogin, trackLoginResult, login);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Solicitar restablecimiento de contraseña
 * @access  Public
 */
router.post(
  "/forgot-password",
  sanitizeInput,
  (req: Request, res: Response, next) => {
    // Validación básica para forgot password
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Email válido requerido",
      });
    }
    next();
  },
  forgotPassword
);

/**
 * @route   POST /api/auth/verify-token
 * @desc    Verificar validez del token
 * @access  Public
 */
router.post("/verify-token", verifyToken);

/**
 * @route   POST /api/auth/get-id-token
 * @desc    Convertir custom token a ID token (SOLO PARA TESTING)
 * @access  Public
 */
router.post("/get-id-token", getIdToken);

// ========== RUTAS PROTEGIDAS ==========

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión
 * @access  Private
 */
router.post("/logout", authMiddleware, logoutHandler);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Renovar token de acceso
 * @access  Private
 */
router.post("/refresh-token", authMiddleware, refreshTokenHandler);

/**
 * @route   PUT /api/auth/change-password/:uid
 * @desc    Cambiar contraseña de usuario
 * @access  Private (Solo Admin o propio usuario)
 */
router.put(
  "/change-password/:uid",
  authMiddleware,
  sanitizeInput,
  (req: Request, res: Response, next) => {
    // Validación básica para cambio de contraseña
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const errors: string[] = [];

    if (!currentPassword) errors.push("Contraseña actual requerida");
    if (!newPassword) errors.push("Nueva contraseña requerida");
    if (!confirmPassword) errors.push("Confirmación de contraseña requerida");

    if (newPassword && newPassword.length < 8) {
      errors.push("La nueva contraseña debe tener al menos 8 caracteres");
    }

    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      errors.push("Las contraseñas no coinciden");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: "Datos inválidos",
        details: errors,
      });
    }

    next();
  },
  changePasswordHandler
);

export default router;
