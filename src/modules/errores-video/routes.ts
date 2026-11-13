import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authMiddleware, AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateBody, validateParams } from "../../middleware/zodValidation";
import { db } from "../../config/firebase";
import { validateUser } from "../../utils/utils";

/**
 * Registro de videos que no se pudieron reproducir en la app del alumno.
 * Un documento por video (`erroresVideo/{hash de la url}`) con el total de fallas
 * y las últimas ocurrencias (código de error, dispositivo, alumno).
 */
const router = Router();

const ULTIMAS_OCURRENCIAS = 30;

const ErrorVideoSchema = z.object({
  url: z.string().min(1).max(2000),
  codigo: z.number().int().min(0).max(10).nullable(),
  mensaje: z.string().max(500).optional(),
  idCurso: z.string().max(200).optional(),
  idModulo: z.string().max(200).optional(),
  material: z.string().max(300).optional(),
  dispositivo: z.string().max(500).optional(),
  conexion: z.string().max(50).optional(),
});

const registrarErrorVideo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = req.body as z.infer<typeof ErrorVideoSchema>;
    const id = createHash("sha1").update(data.url).digest("hex");
    const ref = db.collection("erroresVideo").doc(id);

    const ocurrencia = {
      fecha: new Date().toISOString(),
      uid: req.user.uid,
      email: req.user.email ?? null,
      codigo: data.codigo,
      mensaje: data.mensaje ?? null,
      dispositivo: data.dispositivo ?? null,
      conexion: data.conexion ?? null,
    };

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const previas = (snap.data()?.ultimas as unknown[] | undefined) ?? [];
      tx.set(
        ref,
        {
          url: data.url,
          idCurso: data.idCurso ?? null,
          idModulo: data.idModulo ?? null,
          material: data.material ?? null,
          total: FieldValue.increment(1),
          ultimaFecha: ocurrencia.fecha,
          ultimas: [ocurrencia, ...previas].slice(0, ULTIMAS_OCURRENCIAS),
        },
        { merge: true }
      );
    });

    console.warn(
      `[video] No se pudo reproducir (código ${data.codigo ?? "?"}) uid=${req.user.uid} url=${data.url}`
    );
    res.status(204).end();
  } catch (error) {
    console.error("Error al registrar falla de video:", error);
    res.status(500).json({ error: "No se pudo registrar el error" });
  }
};

/** Admin: videos con fallas, los más recientes primero. */
const listarErroresVideo = async (req: AuthenticatedRequest, res: Response) => {
  if (!(await validateUser(req))) {
    res.status(403).json({ error: "No autorizado. Se requieren permisos de administrador." });
    return;
  }
  try {
    const snap = await db.collection("erroresVideo").orderBy("ultimaFecha", "desc").limit(200).get();
    res.json({ data: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    console.error("Error al listar fallas de video:", error);
    res.status(500).json({ error: "No se pudieron cargar los errores de video" });
  }
};

/** Admin: se marca como resuelto borrando el registro; si vuelve a fallar, aparece de nuevo. */
const resolverErrorVideo = async (req: AuthenticatedRequest, res: Response) => {
  if (!(await validateUser(req))) {
    res.status(403).json({ error: "No autorizado. Se requieren permisos de administrador." });
    return;
  }
  try {
    await db.collection("erroresVideo").doc(req.params.id).delete();
    res.status(204).end();
  } catch (error) {
    console.error("Error al resolver falla de video:", error);
    res.status(500).json({ error: "No se pudo marcar como resuelto" });
  }
};

const IdParamSchema = z.object({ id: z.string().regex(/^[0-9a-f]{40}$/, "ID inválido") });

router.post("/", authMiddleware, validateBody(ErrorVideoSchema), (req: Request, res: Response) =>
  registrarErrorVideo(req as AuthenticatedRequest, res)
);
router.get("/", authMiddleware, (req: Request, res: Response) =>
  listarErroresVideo(req as AuthenticatedRequest, res)
);
router.delete("/:id", authMiddleware, validateParams(IdParamSchema), (req: Request, res: Response) =>
  resolverErrorVideo(req as AuthenticatedRequest, res)
);

export default router;
