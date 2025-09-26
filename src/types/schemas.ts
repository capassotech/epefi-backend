import { z } from "zod";

enum TipoContenido {
  VIDEO = "video",
  PDF = "pdf",
  EVALUACION = "evaluacion",
  IMAGEN = "imagen",
  CONTENIDO_EXTRA = "contenido_extra",
}

export interface Content {
  titulo: string;
  descripcion: string;
  tipo_contenido: TipoContenido;
  duracion: number;
  url_contenido: string;
  url_miniatura: string | null;
}

export interface Module {
  id_curso: string;
  titulo: string;
  descripcion: string;
  temas: string[];
  contenido: Content[];
}

export const ContentSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título del contenido es obligatorio")
    .max(200, "El título no puede exceder 200 caracteres")
    .trim(),
  descripcion: z
    .string()
    .min(1, "La descripción del contenido es obligatoria")
    .max(1000, "La descripción no puede exceder 1000 caracteres")
    .trim(),
  tipo_contenido: z.enum(TipoContenido),
  duracion: z
    .number()
    .int("La duración debe ser un número entero")
    .min(0, "La duración no puede ser negativa")
    .max(7200, "La duración no puede exceder 2 horas (7200 segundos)"),
  url_contenido: z
    .string()
    // .url("Debe ser una URL válida")
    .min(1, "La URL del contenido es obligatoria"),
  url_miniatura: z
    .string()
    // .url("Debe ser una URL válida")
    .nullable()
    .optional(),
});

export const CourseSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título del curso es obligatorio")
    .max(200, "El título no puede exceder 200 caracteres")
    .trim(),
  descripcion: z
    .string()
    .min(1, "La descripción del curso es obligatoria")
    .max(2000, "La descripción no puede exceder 2000 caracteres")
    .trim(),
  estado: z.enum(["activo", "inactivo"]).default("activo"),
  imagen: z
    .string()
    .max(200, "La imagen no puede exceder 200 caracteres")
    .trim()
    .optional(),
  precio: z
    .number()
    .positive("El precio debe ser un número positivo"),
  materias: z
    .array(z.string())
    .min(1, "Debe incluir al menos una materia")
    .max(20, "No puede tener más de 20 materias"),
});

export const MateriaSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre de la materia es obligatorio")
    .max(100, "El nombre de la materia no puede exceder 100 caracteres")
    .trim(),
  id_cursos: z
    .array(z.string())
    .min(1, "Debe incluir al menos un curso")
    .max(20, "No puede tener más de 20 cursos"),
  modulos: z
    .array(z.string())
    .min(1, "Debe incluir al menos un módulo")
    .max(20, "No puede tener más de 20 módulos"),
});

export const ModuleSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título del módulo es obligatorio")
    .max(200, "El título no puede exceder 200 caracteres")
    .trim(),
  descripcion: z
    .string()
    .min(1, "La descripción del módulo es obligatoria")
    .max(2000, "La descripción no puede exceder 2000 caracteres")
    .trim(),
  tipo_contenido: z.enum(TipoContenido),
  url_contenido: z
    .string()
    .min(1, "La URL del contenido es obligatoria"),
  url_miniatura: z
    .string()
    .nullable()
    .optional(),
  id_materia: z
    .string()
    .min(1, "El ID de la materia es obligatorio")
    .max(100, "El ID de la materia no puede exceder 100 caracteres")
    .trim(),
  bibliografia: z
    .string()
    .min(1, "La bibliografía es obligatoria")
    .max(2000, "La bibliografía no puede exceder 2000 caracteres")
    .trim(),
});

export const UpdateModuleSchema = ModuleSchema.partial();
export const UpdateCourseSchema = CourseSchema.partial();
export const UpdateMateriaSchema = MateriaSchema.partial();

export type ValidatedContent = z.infer<typeof ContentSchema>;
export type ValidatedUpdateModule = z.infer<typeof UpdateModuleSchema>;
export type ValidatedModule = z.infer<typeof ModuleSchema>;
export type ValidatedUpdateCourse = z.infer<typeof UpdateCourseSchema>;
export type ValidatedCourse = z.infer<typeof CourseSchema>;
export type ValidatedMateria = z.infer<typeof MateriaSchema>;
export type ValidatedUpdateMateria = z.infer<typeof UpdateMateriaSchema>;
export interface Materia {
  id: string;
  nombre: string;
  id_cursos: string[]; 
  modulos: string[]; 
}
