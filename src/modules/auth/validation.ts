import type { ValidationSchema } from "../../middleware/validation";

// Esquemas simples para compatibilidad
export const registerSchema: ValidationSchema = {
  body: {}, // La validación real se hace en validateRegistration middleware
};

export const loginSchema: ValidationSchema = {
  body: {}, // La validación real se hace en validateLogin middleware
};

export const forgotPasswordSchema: ValidationSchema = {
  body: {}, // Validación básica para email
};

export const changePasswordSchema: ValidationSchema = {
  body: {}, // Validación para cambio de contraseña
  params: {}, // Validación para UID en parámetros
};
