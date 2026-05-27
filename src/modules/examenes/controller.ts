import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { ValidatedExamen } from "../../types/schemas";

const examenesCollection = firestore.collection("examenes");

export const getAllExamenes = async (_req: Request, res: Response) => {
  try {
    const examenesSnapshot = await examenesCollection.get();

    if (examenesSnapshot.empty) {
      return res.json([]);
    }

    const examenes = examenesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(examenes);
  } catch (error) {
    console.error("getAllExamenes error:", error);
    return res.status(500).json({ error: "Error al obtener exámenes" });
  }
};

export const createExamen = async (req: Request, res: Response) => {
  try {
    const examenData: ValidatedExamen = req.body;

    const nuevoExamen = await examenesCollection.add(examenData);

    return res.status(201).json({
      id: nuevoExamen.id,
      ...examenData,
    });
  } catch (error) {
    console.error("createExamen error:", error);
    return res.status(500).json({ error: "Error al crear examen" });
  }
};
