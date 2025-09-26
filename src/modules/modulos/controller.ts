import { firestore } from "../../config/firebase";
import { Request, Response } from "express";
import { ValidatedModule, ValidatedUpdateModule } from "../../types/modules";

const materiasCollection = firestore.collection("materias");
const modulosCollection = firestore.collection("modulos");
const cursosCollection = firestore.collection("cursos");


export const getBackModules = async (req: Request, res: Response) => {
  try {
    const backModules = await modulosCollection.get();

    if (backModules.empty) {
      return res.json([]);
    }

    const modules = backModules.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(modules);
  } catch (error) {
    console.error("getBackModules error:", error);
    res.status(500).json({ error: "Error al obtener módulos" });
  }
};

export const getBackModuleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const backModule = await modulosCollection.doc(id).get();

    if (!backModule.exists) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    res.json({ id: backModule.id, ...backModule.data() });
  } catch (error) {
    console.error("getBackModuleById error:", error);
    res.status(500).json({ error: "Error al obtener módulo" });
  }
};

export const createBackModule = async (req: Request, res: Response) => {
  try {
    const moduleData: ValidatedModule = req.body;

    const materiaExists = await materiasCollection
      .doc(moduleData.id_materia)
      .get();
    if (!materiaExists.exists) {
      return res.status(404).json({ error: "La materia especificada no existe" });
    }

    const newModule = await modulosCollection.add({
      ...moduleData,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    });

    await materiasCollection
      .doc(moduleData.id_materia)
      .update({
        modulos: [...materiaExists.data()?.modulos, newModule.id],
      });

    res.status(201).json({
      id: newModule.id,
      message: "Módulo creado exitosamente",
    });
  } catch (error) {
    console.error("createBackModule error:", error);
    res.status(500).json({ error: "Error al crear módulo" });
  }
};

export const updateBackModule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData: ValidatedUpdateModule = req.body;

    const moduleExists = await modulosCollection.doc(id).get();
    if (!moduleExists.exists) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    const materiaExists = await materiasCollection
      .doc(updateData.id_materia || "")
      .get();
    if (updateData.id_materia) {
      if (!materiaExists.exists) {
        return res
          .status(404)
          .json({ error: "La materia especificada no existe" });
      }
    }

    await modulosCollection
      .doc(id)
      .update({
        ...updateData,
        fechaActualizacion: new Date(),
      });

    const currentModules = materiaExists.data()?.modulos || [];
    const updatedModules = currentModules.includes(id)
      ? currentModules
      : [...currentModules, id];

    await materiasCollection
      .doc(updateData.id_materia || "")
      .update({
        modulos: updatedModules,
      });

    res.json({
      message: "Módulo actualizado exitosamente",
      id: id,
    });
  } catch (error) {
    console.error("updateBackModule error:", error);
    res.status(500).json({ error: "Error al actualizar módulo" });
  }
};

export const deleteBackModule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const moduleExists = await modulosCollection.doc(id).get();
    if (!moduleExists.exists) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    const moduleRef = await modulosCollection
      .doc(moduleExists.data()?.modulos)
      .get();
    const currentModules = moduleRef.data()?.modulos || [];

    await modulosCollection
      .doc(moduleExists.data()?.modulos)
      .update({
        modulos: currentModules.filter(
          (moduleId: string) => moduleId !== id
        ),
      });

    await modulosCollection.doc(id).delete();
    res.json({ message: "Módulo eliminado correctamente" });
  } catch (error) {
    console.error("deleteBackModule error:", error);
    res.status(500).json({ error: "Error al eliminar módulo" });
  }
};
