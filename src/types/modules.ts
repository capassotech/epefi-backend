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

export const ModuleSchema = z.object({
  id_curso: z
    .string()
    .min(1, "El ID del curso es obligatorio")
    .max(100, "El ID del curso no puede exceder 100 caracteres")
    .trim(),
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
  temas: z
    .array(z.string().min(1, "Los temas no pueden estar vacíos"))
    .min(1, "Debe incluir al menos un tema")
    .max(20, "No puede tener más de 20 temas"),
  contenido: z
    .array(ContentSchema)
    .min(1, "Debe incluir al menos un contenido")
    .max(50, "No puede tener más de 50 contenidos"),
});

export const UpdateModuleSchema = ModuleSchema.partial();

export type ValidatedModule = z.infer<typeof ModuleSchema>;
export type ValidatedContent = z.infer<typeof ContentSchema>;
export type ValidatedUpdateModule = z.infer<typeof UpdateModuleSchema>;
export interface Materia {
  id: string;
  nombre: string;
  id_cursos: string[]; // Array of course IDs this materia belongs to
  modulos: string[]; // Array of module IDs
}
