import { Request, Response, NextFunction } from "express";
import { z } from "zod";

export type ValidationTarget = "body" | "params" | "query";

export const validateSchema = (
  schema: z.ZodSchema,
  target: ValidationTarget = "body"
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = req[target];

      const validatedData = schema.parse(dataToValidate);

      (req as any)[target] = validatedData;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.issues.map((err: any) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          error: "Datos de entrada inválidos",
          details: formattedErrors,
          summary: formattedErrors.map((err: any) => err.message),
        });
      }

      console.error("Error inesperado en validación:", error);
      return res.status(500).json({
        error: "Error interno del servidor durante la validación",
      });
    }
  };
};

export const validateBody = (schema: z.ZodSchema) =>
  validateSchema(schema, "body");
export const validateId = (schema: z.ZodSchema) =>
  validateSchema(schema, "params");
export const validateParams = (schema: z.ZodSchema) =>
  validateSchema(schema, "params");

export const validateQuery = (schema: z.ZodSchema) =>
  validateSchema(schema, "query");

export const validateMultiple = (validations: {
  body?: z.ZodSchema;
  params?: z.ZodSchema;
  query?: z.ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors: Array<{ target: string; field: string; message: string }> =
        [];

      // Validar cada parte especificada
      for (const [target, schema] of Object.entries(validations)) {
        if (schema) {
          try {
            const validatedData = schema.parse(req[target as ValidationTarget]);
            (req as any)[target] = validatedData;
          } catch (error) {
            if (error instanceof z.ZodError) {
              errors.push(
                ...error.issues.map((err: any) => ({
                  target,
                  field: err.path.join("."),
                  message: err.message,
                }))
              );
            }
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({
          error: "Datos de entrada inválidos",
          details: errors,
          summary: errors.map(
            (err: any) => `${err.target}.${err.field}: ${err.message}`
          ),
        });
      }

      next();
    } catch (error) {
      console.error("Error inesperado en validación múltiple:", error);
      return res.status(500).json({
        error: "Error interno del servidor durante la validación",
      });
    }
  };
};

export const basicSanitization = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const sanitizeString = (str: string): string => {
    return str
      .trim()
      .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
      .slice(0, 10000);
  };

  const sanitizeObject = (obj: any): any => {
    if (typeof obj === "string") {
      return sanitizeString(obj);
    }
    if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof key === "string" && key.length < 100) {
          sanitized[key] = sanitizeObject(value);
        }
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }

  next();
};
