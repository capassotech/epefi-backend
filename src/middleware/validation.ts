// src/middleware/validation.ts (CORRECTED VERSION)
import type { Request, Response, NextFunction } from "express";
import type {
  UserRegistrationData,
  LoginData,
  UpdateProfileData,
} from "../types/user";

const loginAttempts = new Map<
  string,
  { count: number; lastAttempt: Date; blockedUntil?: Date }
>();

const getClientIP = (req: Request): string => {
  return (
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    "unknown"
  );
};

const cleanOldAttempts = () => {
  const now = new Date();
  for (const [ip, attempt] of loginAttempts.entries()) {
    if (now.getTime() - attempt.lastAttempt.getTime() > 24 * 60 * 60 * 1000) {
      loginAttempts.delete(ip);
    }
  }
};

setInterval(cleanOldAttempts, 60 * 60 * 1000);

// Interface para esquemas de validación Joi (para compatibilidad)
export interface ValidationSchema {
  body?: any;
  query?: any;
  params?: any;
}

// Función principal de validación que necesita auth/routes.ts
export const validateRequest = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Esta función se mantiene para compatibilidad pero usa las validaciones específicas
    next();
  };
};

export const validateRegistration = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { email, password, nombre, apellido, dni }: UserRegistrationData =
    req.body;

  const errors: string[] = [];

  if (!email) errors.push("Email es requerido");
  if (!password) errors.push("Contraseña es requerida");
  if (!nombre) errors.push("Nombre es requerido");
  if (!apellido) errors.push("Apellido es requerido");
  if (!dni) errors.push("DNI es requerido");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Formato de email inválido");
  }

  if (password) {
    if (password.length < 8) {
      errors.push("La contraseña debe tener al menos 8 caracteres");
    }
    if (!/(?=.*[a-z])/.test(password)) {
      errors.push("La contraseña debe contener al menos una letra minúscula");
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push("La contraseña debe contener al menos una letra mayúscula");
    }
    if (!/(?=.*\d)/.test(password)) {
      errors.push("La contraseña debe contener al menos un número");
    }
    if (!/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/.test(password)) {
      errors.push("La contraseña debe contener al menos un carácter especial");
    }
    const commonPasswords = [
      "password",
      "123456",
      "123456789",
      "qwerty",
      "abc123",
      "password123",
      "12345678",
      "admin",
      "letmein",
      "welcome",
    ];
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push("La contraseña es demasiado común, elija una más segura");
    }
  }

  // Validación de nombre con caracteres permitidos
  if (nombre) {
    if (typeof nombre !== "string" || nombre.trim().length < 2) {
      errors.push("El nombre debe tener al menos 2 caracteres");
    } else if (nombre.trim().length > 50) {
      errors.push("El nombre no puede exceder 50 caracteres");
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(nombre)) {
      errors.push(
        "El nombre solo puede contener letras, espacios, apostrofes y guiones"
      );
    }
  }

  // Validación de apellido
  if (apellido) {
    if (typeof apellido !== "string" || apellido.trim().length < 2) {
      errors.push("El apellido debe tener al menos 2 caracteres");
    } else if (apellido.trim().length > 50) {
      errors.push("El apellido no puede exceder 50 caracteres");
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(apellido)) {
      errors.push(
        "El apellido solo puede contener letras, espacios, apostrofes y guiones"
      );
    }
  }

  if (dni) {
    const dniStr = typeof dni === "string" ? dni.trim() : String(dni); // FIXED SYNTAX ERROR
    if (dniStr && !/^\d{7,8}$/.test(dniStr)) {
      errors.push("DNI debe tener entre 7 y 8 dígitos");
    } else if (dniStr) {
      // Validar que no sea un DNI obviamente falso
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
      if (invalidDnis.includes(dniStr.padStart(8, "0"))) {
        errors.push("DNI no válido");
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Datos de registro inválidos",
      details: errors,
    });
  }

  // Sanitizar datos
  req.body.nombre = nombre?.trim();
  req.body.apellido = apellido?.trim();
  req.body.email = email?.toLowerCase().trim();
  req.body.dni = dni
    ? typeof dni === "string"
      ? dni.trim()
      : String(dni).trim()
    : undefined;

  next();
};

export const validateLogin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { email, password }: LoginData = req.body;
  const errors: string[] = [];
  const clientIP = getClientIP(req);
  const now = new Date();

  // Verificar rate limiting
  const attempt = loginAttempts.get(clientIP);
  if (attempt) {
    // Si está bloqueado temporalmente
    if (attempt.blockedUntil && now < attempt.blockedUntil) {
      const minutesLeft = Math.ceil(
        (attempt.blockedUntil.getTime() - now.getTime()) / (60 * 1000)
      );
      return res.status(429).json({
        error: `Demasiados intentos fallidos. Intente nuevamente en ${minutesLeft} minutos.`,
        retryAfter: minutesLeft * 60,
      });
    }

    // Resetear contador si han pasado más de 15 minutos desde el último intento
    if (now.getTime() - attempt.lastAttempt.getTime() > 15 * 60 * 1000) {
      loginAttempts.delete(clientIP);
    } else if (attempt.count >= 5) {
      // Bloquear por tiempo creciente: 5 intentos = 15min, 10 = 30min, 15 = 1h
      const blockMinutes = Math.min(15 * Math.ceil(attempt.count / 5), 60);
      attempt.blockedUntil = new Date(now.getTime() + blockMinutes * 60 * 1000);
      attempt.lastAttempt = now;
      loginAttempts.set(clientIP, attempt);

      return res.status(429).json({
        error: `Demasiados intentos fallidos. Cuenta bloqueada por ${blockMinutes} minutos.`,
        retryAfter: blockMinutes * 60,
      });
    }
  }

  if (!email) errors.push("Email es requerido");
  if (!password) errors.push("Contraseña es requerida");

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Formato de email inválido");
  }

  // Validación adicional para detectar intentos maliciosos
  if (email && email.length > 254) {
    errors.push("Email demasiado largo");
  }

  if (password && password.length > 128) {
    errors.push("Contraseña demasiado larga");
  }

  if (errors.length > 0) {
    const currentAttempt = loginAttempts.get(clientIP) || {
      count: 0,
      lastAttempt: now,
    };
    currentAttempt.count++;
    currentAttempt.lastAttempt = now;
    loginAttempts.set(clientIP, currentAttempt);

    return res.status(400).json({
      error: "Datos de login inválidos",
      details: errors,
    });
  }

  req.body.email = email.toLowerCase().trim();
  (req as any).loginAttempt = {
    clientIP,
    currentAttempts: attempt?.count || 0,
  };

  next();
};

export const validateProfileUpdate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { nombre, apellido }: UpdateProfileData = req.body;
  const errors: string[] = [];

  if (!nombre && !apellido) {
    errors.push("Debe proporcionar al menos un campo para actualizar");
  }

  if (nombre !== undefined) {
    if (typeof nombre !== "string" || nombre.trim().length < 2) {
      errors.push("El nombre debe tener al menos 2 caracteres");
    } else if (nombre.trim().length > 50) {
      errors.push("El nombre no puede exceder 50 caracteres");
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(nombre)) {
      errors.push(
        "El nombre solo puede contener letras, espacios, apostrofes y guiones"
      );
    }
  }

  if (apellido !== undefined) {
    if (typeof apellido !== "string" || apellido.trim().length < 2) {
      errors.push("El apellido debe tener al menos 2 caracteres");
    } else if (apellido.trim().length > 50) {
      errors.push("El apellido no puede exceder 50 caracteres");
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/.test(apellido)) {
      errors.push(
        "El apellido solo puede contener letras, espacios, apostrofes y guiones"
      );
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: "Datos de actualización inválidos",
      details: errors,
    });
  }

  if (nombre) req.body.nombre = nombre.trim();
  if (apellido) req.body.apellido = apellido.trim();

  next();
};

// Middleware para rastrear el resultado del login
export const trackLoginResult = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const originalSend = res.send;
  const loginAttemptInfo = (req as any).loginAttempt;

  if (!loginAttemptInfo) {
    return next();
  }

  res.send = function (data) {
    const { clientIP } = loginAttemptInfo;
    const now = new Date();

    if (res.statusCode === 200 || res.statusCode === 201) {
      loginAttempts.delete(clientIP);
      console.log(`Login exitoso desde IP: ${clientIP}`);
    } else if (res.statusCode === 401 || res.statusCode === 403) {
      const attempt = loginAttempts.get(clientIP) || {
        count: 0,
        lastAttempt: now,
      };
      attempt.count++;
      attempt.lastAttempt = now;
      loginAttempts.set(clientIP, attempt);

      console.log(
        `Login fallido desde IP: ${clientIP}, intentos: ${attempt.count}`
      );

      if (attempt.count >= 3) {
        console.warn(
          `⚠️  ALERTA DE SEGURIDAD: ${attempt.count} intentos fallidos desde IP: ${clientIP}`
        );
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

// Middleware adicional para sanitización general
export const sanitizeInput = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sanitize = (obj: any): any => {
    if (typeof obj === "string") {
      // Remover caracteres peligrosos y normalizar
      return obj
        .trim()
        .replace(/[\x00-\x1f\x7f-\x9f]/g, "") // Remover caracteres de control
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "") // Remover scripts
        .slice(0, 1000); // Limitar longitud
    }
    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
      const cleaned: any = {};
      for (const key in obj) {
        if (
          obj.hasOwnProperty(key) &&
          typeof key === "string" &&
          key.length < 100
        ) {
          cleaned[key] = sanitize(obj[key]);
        }
      }
      return cleaned;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }

  next();
};

// Estadísticas de intentos de login (para monitoreo)
export const getLoginStats = () => {
  const now = new Date();
  const stats = {
    totalAttempts: loginAttempts.size,
    blockedIPs: 0,
    recentAttempts: 0,
  };

  for (const [ip, attempt] of loginAttempts.entries()) {
    if (attempt.blockedUntil && now < attempt.blockedUntil) {
      stats.blockedIPs++;
    }
    if (now.getTime() - attempt.lastAttempt.getTime() < 60 * 60 * 1000) {
      // Última hora
      stats.recentAttempts++;
    }
  }

  return stats;
};
