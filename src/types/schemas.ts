import { z } from "zod";
import {
  isValidPassword,
  PASSWORD_POLICY_MESSAGE,
} from "../utils/passwordValidator";
import {
  normalizePreguntasPuntos,
  puntosSumEqualsTotal,
  PUNTOS_TOTAL_EXAMEN,
  roundPuntos,
} from "../utils/examenScoring";

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
  password: z
    .string()
    .min(1, "La contraseña del usuario es obligatoria")
    .max(128, "La contraseña no puede exceder 128 caracteres")
    .refine((value) => isValidPassword(value), {
      message: PASSWORD_POLICY_MESSAGE,
    }),
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
  planDeEstudiosUrl: z
    .union([z.string().url("La URL del plan de estudios debe ser válida"), z.null(), z.literal("")])
    .optional()
    .transform((val) => (val === "" ? null : val)),
  fechasDeExamenesUrl: z
    .union([z.string().url("La URL de fechas de exámenes debe ser válida"), z.null(), z.literal("")])
    .optional()
    .transform((val) => (val === "" ? null : val)),
  fechaInicioDictado: z
    .string()
    .min(1, "La fecha de inicio del dictado es obligatoria")
    .refine(
      (val) => {
        // Validar que sea un string ISO válido o un formato de fecha válido
        const date = new Date(val);
        return !isNaN(date.getTime());
      },
      { message: "Formato de fecha inválido" }
    )
    .optional(),
  fechaFinDictado: z
    .string()
    .min(1, "La fecha de fin del dictado es obligatoria")
    .refine(
      (val) => {
        // Validar que sea un string ISO válido o un formato de fecha válido
        const date = new Date(val);
        return !isNaN(date.getTime());
      },
      { message: "Formato de fecha inválido" }
    )
    .optional(),
});

export const MateriaSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre de la materia es obligatorio")
    .max(100, "El nombre de la materia no puede exceder 100 caracteres")
    .trim(),
  activo: z.boolean().default(true),
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
    .max(20, "No puede tener más de 20 cursos"),
  nombres_archivos: z
    .string()
    .optional(),
  nombres_videos: z
    .string()
    .optional(),
});

const PreguntaExamenSchema = z.object({
  id: z.string().min(1, "El ID de la pregunta es obligatorio").trim(),
  texto: z
    .string()
    .min(1, "El texto de la pregunta es obligatorio")
    .trim(),
  puntos: z
    .number()
    .positive("Los puntos deben ser mayores a 0")
    .max(100, "Los puntos de una pregunta no pueden exceder 100")
    .optional(),
  respuestas: z
    .array(
      z.object({
        id: z.string().min(1, "El ID de la respuesta es obligatorio").trim(),
        texto: z
          .string()
          .min(1, "El texto de la respuesta es obligatorio")
          .trim(),
        esCorrecta: z.boolean(),
      })
    )
    .min(1, "Cada pregunta debe tener al menos una respuesta"),
});

const validateExamenRespuestasCorrectas = (
  data: { preguntas: z.infer<typeof PreguntaExamenSchema>[] },
  ctx: z.RefinementCtx
) => {
  data.preguntas.forEach((pregunta, index) => {
    const tieneCorrecta = pregunta.respuestas.some(
      (respuesta) => respuesta.esCorrecta === true
    );
    if (!tieneCorrecta) {
      ctx.addIssue({
        code: "custom",
        path: ["preguntas", index, "respuestas"],
        message:
          "Cada pregunta debe tener al menos una respuesta marcada como correcta",
      });
    }
  });
};

const validateExamenPreguntasPuntos = (
  data: { preguntas: z.infer<typeof PreguntaExamenSchema>[] },
  ctx: z.RefinementCtx
) => {
  const preguntas = data.preguntas;
  if (preguntas.length === 0) return;

  const allHavePuntos = preguntas.every(
    (pregunta) => typeof pregunta.puntos === "number" && pregunta.puntos > 0
  );
  const noneHavePuntos = preguntas.every(
    (pregunta) => pregunta.puntos == null || pregunta.puntos === undefined
  );

  if (noneHavePuntos || allHavePuntos) {
    if (allHavePuntos) {
      const sum = preguntas.reduce(
        (acc, pregunta) => acc + (pregunta.puntos ?? 0),
        0
      );
      if (!puntosSumEqualsTotal(sum)) {
        ctx.addIssue({
          code: "custom",
          path: ["preguntas"],
          message: `La suma de puntos debe ser ${PUNTOS_TOTAL_EXAMEN} (actual: ${roundPuntos(sum)})`,
        });
      }
    }
    return;
  }

  ctx.addIssue({
    code: "custom",
    path: ["preguntas"],
    message: "Todas las preguntas deben tener puntos asignados",
  });
};

const preprocessExamenPuntos = (input: unknown): unknown => {
  if (typeof input !== "object" || input == null || !("preguntas" in input)) {
    return input;
  }

  const examen = input as { preguntas: Array<{ puntos?: number }> };
  if (!Array.isArray(examen.preguntas) || examen.preguntas.length === 0) {
    return input;
  }

  const noneHavePuntos = examen.preguntas.every(
    (pregunta) => pregunta.puntos == null || pregunta.puntos === undefined
  );

  if (!noneHavePuntos) {
    return input;
  }

  try {
    return {
      ...examen,
      preguntas: normalizePreguntasPuntos(examen.preguntas),
    };
  } catch {
    return input;
  }
};

const ExamenBaseSchema = z
  .object({
    titulo: z
      .string()
      .min(1, "El titulo es obligatorio")
      .max(100, "El titulo no puede exceder 100 caracteres")
      .trim(),
    idFormacion: z
      .string()
      .min(1, "El idFormacion es obligatorio")
      .max(100, "El idFormacion no puede exceder 100 caracteres")
      .trim(),
    /** Duración total del examen en minutos. Por defecto 90. */
    duracionMinutos: z
      .number({ message: "La duración debe ser un número" })
      .int("La duración debe ser un número entero")
      .min(1, "La duración mínima es 1 minuto")
      .max(480, "La duración máxima es 480 minutos")
      .default(90),
    preguntas: z
      .array(PreguntaExamenSchema)
      .min(1, "El examen debe tener al menos una pregunta"),
  })
  .superRefine(validateExamenRespuestasCorrectas)
  .superRefine(validateExamenPreguntasPuntos);

export const ExamenSchema = z.preprocess(preprocessExamenPuntos, ExamenBaseSchema);

export const UpdateUserSchema = z
  .object({
    uid: z.string().optional(),
    email: z.string().email("El email del usuario es obligatorio").optional(),
    nombre: z.string().min(1, "El nombre del usuario es obligatorio").optional(),
    apellido: z.string().min(1, "El apellido del usuario es obligatorio").optional(),
    password: z
      .string()
      .max(128, "La contraseña no puede exceder 128 caracteres")
      .optional(),
    dni: z.string().optional(), // Permitir DNI vacío o opcional para usuarios de Google
    role: z
      .object({
        admin: z.boolean(),
        student: z.boolean(),
      })
      .optional(),
    activo: z.boolean().optional(),
    cursos_asignados: z.array(z.string()).optional(),
    emailVerificado: z.boolean().optional(),
    modulos_habilitados: z.record(z.string(), z.boolean()).optional(), // Record<string, boolean>
    progreso: z.record(z.string(), z.record(z.string(), z.boolean())).optional(), // Record<string, Record<string, boolean>>
  })
  .superRefine((data, ctx) => {
    if (!data.password) return;
    if (!isValidPassword(data.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: PASSWORD_POLICY_MESSAGE,
      });
    }
  });

export const UpdateProfileSchema = z.object({
  nombre: z.string().min(1, "El nombre del usuario es obligatorio").trim().optional(),
  apellido: z.string().min(1, "El apellido del usuario es obligatorio").trim().optional(),
  dni: z.string().min(1, "El DNI del usuario es obligatorio").trim().optional(),
  email: z.string().email("El email del usuario debe ser válido").optional(),
});

export const UpdateModuleSchema = ModuleSchema.partial();
export const UpdateCourseSchema = CourseSchema.partial();
export const UpdateMateriaSchema = MateriaSchema.partial();
export const UpdateExamenSchema = ExamenBaseSchema.partial();

export const SubmitExamenSchema = z.object({
  idExamen: z.string().min(1, "El idExamen es obligatorio").trim(),
  idFormacion: z.string().min(1, "El idFormacion es obligatorio").trim(),
  /** tiempo = se agotó el contador; abandono = cerró a mitad; envio = finalizó normal. */
  motivoCierre: z.enum(["tiempo", "abandono", "envio"]).optional(),
  respuestas: z
    .array(
      z.object({
        idPregunta: z.string().min(1, "El idPregunta es obligatorio").trim(),
        respuestasSeleccionadas: z.array(z.string().min(1).trim()),
      })
    )
    .min(1, "Debés enviar al menos una respuesta"),
});

export type ValidatedUser = z.infer<typeof UserSchema>;
export type ValidatedUpdateUser = z.infer<typeof UpdateUserSchema>;
export type ValidatedUpdateProfile = z.infer<typeof UpdateProfileSchema>;
export type ValidatedUpdateModule = z.infer<typeof UpdateModuleSchema>;
export type ValidatedModule = z.infer<typeof ModuleSchema>;
export type ValidatedUpdateCourse = z.infer<typeof UpdateCourseSchema>;
export type ValidatedCourse = z.infer<typeof CourseSchema>;
export type ValidatedMateria = z.infer<typeof MateriaSchema>;
export type ValidatedUpdateMateria = z.infer<typeof UpdateMateriaSchema>;
export type ValidatedExamen = z.infer<typeof ExamenSchema>;
export type ValidatedUpdateExamen = z.infer<typeof UpdateExamenSchema>;
export type ValidatedSubmitExamen = z.infer<typeof SubmitExamenSchema>;
export interface Materia {
  id: string;
  nombre: string;
  activo: boolean;
  id_cursos: string[]; 
  modulos: string[]; 
}
