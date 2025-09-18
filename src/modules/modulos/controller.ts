import { firestore } from "../../config/firebase";
import { Request, Response } from "express";
import { ValidatedModule, ValidatedUpdateModule } from "../../types/modules";

export const getBackModules = async (req: Request, res: Response) => {
  try {
    const backModules = await firestore.collection("modulos").get();

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
    const backModule = await firestore.collection("modulos").doc(id).get();

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

    const cursoExists = await firestore
      .collection("courses")
      .doc(moduleData.id_curso)
      .get();
    if (!cursoExists.exists) {
      return res.status(404).json({ error: "El curso especificado no existe" });
    }

    const newModule = await firestore.collection("modulos").add({
      ...moduleData,
      fechaCreacion: new Date(),
      fechaActualizacion: new Date(),
    });

    await firestore
      .collection("courses")
      .doc(moduleData.id_curso)
      .update({
        id_modulos: [...cursoExists.data()?.id_modulos, newModule.id],
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

    const moduleExists = await firestore.collection("modulos").doc(id).get();
    if (!moduleExists.exists) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    const cursoExists = await firestore
      .collection("courses")
      .doc(updateData.id_curso || "")
      .get();
    if (updateData.id_curso) {
      if (!cursoExists.exists) {
        return res
          .status(404)
          .json({ error: "El curso especificado no existe" });
      }
    }

    await firestore
      .collection("modulos")
      .doc(id)
      .update({
        ...updateData,
        fechaActualizacion: new Date(),
      });

    const currentModules = cursoExists.data()?.id_modulos || [];
    const updatedModules = currentModules.includes(id)
      ? currentModules
      : [...currentModules, id];

    await firestore
      .collection("courses")
      .doc(updateData.id_curso || "")
      .update({
        id_modulos: updatedModules,
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

    const moduleExists = await firestore.collection("modulos").doc(id).get();
    if (!moduleExists.exists) {
      return res.status(404).json({ error: "Módulo no encontrado" });
    }

    const courseRef = await firestore
      .collection("courses")
      .doc(moduleExists.data()?.id_curso)
      .get();
    const currentModules = courseRef.data()?.id_modulos || [];

    await firestore
      .collection("courses")
      .doc(moduleExists.data()?.id_curso)
      .update({
        id_modulos: currentModules.filter(
          (moduleId: string) => moduleId !== id
        ),
      });

    await firestore.collection("modulos").doc(id).delete();
    res.json({ message: "Módulo eliminado correctamente" });
  } catch (error) {
    console.error("deleteBackModule error:", error);
    res.status(500).json({ error: "Error al eliminar módulo" });
  }
};
