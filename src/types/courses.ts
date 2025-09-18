// src/types/courses.ts
import { z } from "zod";

// Schema para Módulo
export const ModuloSchema = z.object({
  nombre: z.string().min(1, "Nombre del módulo es requerido").max(100),
  descripcion: z.string().optional(),
  orden: z.number().int().positive("El orden debe ser un número positivo"),
  contenido: z.array(z.string()).default([]),
  fechaCreacion: z.date().default(() => new Date()),
  fechaActualizacion: z.date().default(() => new Date()),
});

export const UpdateModuloSchema = ModuloSchema.partial().omit({
  fechaCreacion: true,
});

// Schema para Materia
export const MateriaSchema = z.object({
  nombre: z.string().min(1, "Nombre de la materia es requerido").max(100),
  descripcion: z.string().optional(),
  codigo: z.string().min(1, "Código es requerido").max(20),
  creditos: z
    .number()
    .int()
    .positive("Los créditos deben ser un número positivo"),
  modulos: z.array(z.string()).default([]), // Array de IDs de módulos
  prerrequisitos: z.array(z.string()).default([]), // Array de IDs de materias prerequisito
  activa: z.boolean().default(true),
  fechaCreacion: z.date().default(() => new Date()),
  fechaActualizacion: z.date().default(() => new Date()),
});

export const UpdateMateriaSchema = MateriaSchema.partial().omit({
  fechaCreacion: true,
});

// Schema para Curso (Formación)
export const CourseSchema = z.object({
  nombre: z.string().min(1, "Nombre del curso es requerido").max(100),
  descripcion: z.string().optional(),
  duracion: z
    .number()
    .int()
    .positive("La duración debe ser un número positivo"), // en horas
  materias: z.array(z.string()).default([]), // Array de IDs de materias
  nivel: z.enum(["basico", "intermedio", "avanzado"]).default("basico"),
  modalidad: z.enum(["presencial", "virtual", "hibrida"]).default("presencial"),
  precio: z
    .number()
    .positive("El precio debe ser un número positivo")
    .optional(),
  activo: z.boolean().default(true),
  fechaInicio: z.date().optional(),
  fechaFin: z.date().optional(),
  cupoMaximo: z.number().int().positive().optional(),
  instructor: z.string().optional(),
  fechaCreacion: z.date().default(() => new Date()),
  fechaActualizacion: z.date().default(() => new Date()),
});

export const UpdateCourseSchema = CourseSchema.partial().omit({
  fechaCreacion: true,
});

// Tipos TypeScript inferidos
export type ValidatedModulo = z.infer<typeof ModuloSchema>;
export type ValidatedUpdateModulo = z.infer<typeof UpdateModuloSchema>;
export type ValidatedMateria = z.infer<typeof MateriaSchema>;
export type ValidatedUpdateMateria = z.infer<typeof UpdateMateriaSchema>;
export type ValidatedCourse = z.infer<typeof CourseSchema>;
export type ValidatedUpdateCourse = z.infer<typeof UpdateCourseSchema>;

// Tipos para respuestas de la API
export interface ApiMateria
  extends Omit<ValidatedMateria, "fechaCreacion" | "fechaActualizacion"> {
  id: string;
  fechaCreacion: string;
  fechaActualizacion: string;
}

export interface ApiModulo
  extends Omit<ValidatedModulo, "fechaCreacion" | "fechaActualizacion"> {
  id: string;
  fechaCreacion: string;
  fechaActualizacion: string;
}

export interface ApiCourse
  extends Omit<
    ValidatedCourse,
    "fechaCreacion" | "fechaActualizacion" | "fechaInicio" | "fechaFin"
  > {
  id: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  fechaInicio?: string;
  fechaFin?: string;
}
