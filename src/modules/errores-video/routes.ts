import { Router, Request, Response } from "express";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { authMiddleware, AuthenticatedRequest } from "../../middleware/authMiddleware";
import { validateBody } from "../../middleware/zodValidation";
import { db } from "../../config/firebase";

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

router.post("/", authMiddleware, validateBody(ErrorVideoSchema), (req: Request, res: Response) =>
  registrarErrorVideo(req as AuthenticatedRequest, res)
);

export default router;
