import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

// Routes
import authRoutes from "./modules/auth/routes";
import cursosRoutes from "./modules/cursos/routes";
import usersRoutes from "./modules/users/routes";
import materiasRoutes from "./modules/materia/routes";
import modulosRoutes from "./modules/modulos/routes";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - debe estar primero
app.use(cors());

// Body parser
app.use(express.json());

// Registrar rutas
app.use("/api/auth", authRoutes);
app.use("/api/cursos", cursosRoutes);
app.use("/api/materias", materiasRoutes);
app.use("/api/modulos", modulosRoutes);
app.use("/api/usuarios", usersRoutes);

app.get("/", (_, res) => {
  res.json({
    message: "EPEFI Backend Running",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/health", (_, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Middleware de manejo de errores
app.use((err: any, req: any, res: any, next: any) => {
  console.error(`\n❌ [ERROR HANDLER] Error capturado:`, err);
  console.error(`❌ [ERROR HANDLER] Stack:`, err.stack);
  res.status(500).json({ error: "Error interno del servidor", details: err.message });
});

// Middleware para rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
