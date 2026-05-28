import { Request, Response } from "express";
import { firestore } from "../../config/firebase";
import { ValidatedExamen } from "../../types/schemas";

const examenesCollection = firestore.collection("examenes");

export const getAllExamenes = async (req: Request, res: Response) => {
  try {
    const idFormacion = (req.query.idFormacion as string | undefined)?.trim();
    const titulo = (req.query.titulo as string | undefined)?.trim().toLowerCase();
    const search = (req.query.search as string | undefined)?.trim().toLowerCase();
    const sortBy = ((req.query.sortBy as string | undefined) || "titulo").trim();
    const sortOrderParam = ((req.query.sortOrder as string | undefined) || "asc")
      .trim()
      .toLowerCase();
    const sortOrder = sortOrderParam === "desc" ? "desc" : "asc";

    let query: FirebaseFirestore.Query = examenesCollection;
    if (idFormacion) {
      query = query.where("idFormacion", "==", idFormacion);
    }

    const examenesSnapshot = await query.get();

    if (examenesSnapshot.empty) {
      return res.json([]);
    }

    let examenes = examenesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (titulo) {
      examenes = examenes.filter((examen: any) =>
        (examen?.titulo || "").toString().toLowerCase().includes(titulo)
      );
    }

    if (search) {
      examenes = examenes.filter((examen: any) => {
        const examenTitulo = (examen?.titulo || "").toString().toLowerCase();
        const examenFormacion = (examen?.idFormacion || "")
          .toString()
          .toLowerCase();
        return (
          examenTitulo.includes(search) || examenFormacion.includes(search)
        );
      });
    }

    examenes.sort((a: any, b: any) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      if (sortBy === "idFormacion") {
        aValue = (a?.idFormacion || "").toString().toLowerCase();
        bValue = (b?.idFormacion || "").toString().toLowerCase();
      } else if (sortBy === "fechaCreacion") {
        const aDate = a?.fechaCreacion || a?.fechaRegistro || null;
        const bDate = b?.fechaCreacion || b?.fechaRegistro || null;
        aValue = aDate ? new Date(aDate).getTime() : 0;
        bValue = bDate ? new Date(bDate).getTime() : 0;
      } else {
        aValue = (a?.titulo || "").toString().toLowerCase();
        bValue = (b?.titulo || "").toString().toLowerCase();
      }

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return res.json(examenes);
  } catch (error) {
    console.error("getAllExamenes error:", error);
    return res.status(500).json({ error: "Error al obtener exámenes" });
  }
};

export const createExamen = async (req: Request, res: Response) => {
  try {
    const examenData: ValidatedExamen = req.body;
    const now = new Date();
    const examenToCreate = {
      ...examenData,
      fechaCreacion: now,
      fechaActualizacion: now,
    };

    const nuevoExamen = await examenesCollection.add(examenToCreate);

    return res.status(201).json({
      id: nuevoExamen.id,
      ...examenToCreate,
    });
  } catch (error) {
    console.error("createExamen error:", error);
    return res.status(500).json({ error: "Error al crear examen" });
  }
};
