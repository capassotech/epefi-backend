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


export const UserSchema = z.object({
  email: z.string().email("El email del usuario es obligatorio"),
  nombre: z.string().min(1, "El nombre del usuario es obligatorio"),
  apellido: z.string().min(1, "El apellido del usuario es obligatorio"),
  password: z.string().min(1, "La contraseña del usuario es obligatoria"),
  dni: z.string().min(1, "El DNI del usuario es obligatorio"),
  role: z.object({
    admin: z.boolean(),
    student: z.boolean(),
  }),
  activo: z.boolean(),
  cursos_asignados: z.array(z.string()).optional(),
  emailVerificado: z.boolean(),
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
    .trim()
    .optional(),
  precio: z
    .number()
    .positive("El precio debe ser un número positivo"),
  materias: z
    .array(z.string())
    .max(20, "No puede tener más de 20 materias")
    .optional(),
});

export const MateriaSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre de la materia es obligatorio")
    .max(100, "El nombre de la materia no puede exceder 100 caracteres")
    .trim(),
  id_cursos: z
    .array(z.string())
    .max(20, "No puede tener más de 20 cursos")
    .optional(),
  modulos: z
    .array(z.string())
    .max(20, "No puede tener más de 20 módulos")
    .optional(),
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
  url_archivo: z
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
    .max(2000, "La bibliografía no puede exceder 2000 caracteres")
    .trim()
    .optional(),
  url_video: z
    .array(z.string())
    .max(20, "No puede tener más de 20 cursos")
});

export const UpdateUserSchema = UserSchema.partial();

// Schema para actualización de perfil del usuario (solo campos editables)
export const UpdateProfileSchema = z.object({
  nombre: z.string().min(1, "El nombre del usuario es obligatorio").trim().optional(),
  apellido: z.string().min(1, "El apellido del usuario es obligatorio").trim().optional(),
  dni: z.string().min(1, "El DNI del usuario es obligatorio").trim().optional(),
  email: z.string().email("El email del usuario debe ser válido").optional(),
});
export const UpdateModuleSchema = ModuleSchema.partial();
export const UpdateCourseSchema = CourseSchema.partial();
export const UpdateMateriaSchema = MateriaSchema.partial();

export type ValidatedUser = z.infer<typeof UserSchema>;
export type ValidatedUpdateUser = z.infer<typeof UpdateUserSchema>;
export type ValidatedUpdateProfile = z.infer<typeof UpdateProfileSchema>;
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
