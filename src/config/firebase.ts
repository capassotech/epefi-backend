// config/firebase.ts
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

let app: App;

if (getApps().length === 0) {
  try {
    // Prioridad 1: Archivo de service account especificado en variable de entorno
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccountPath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      
      if (fs.existsSync(serviceAccountPath)) {
        console.log("✅ Usando archivo de service account (variable de entorno):", serviceAccountPath);
        app = initializeApp({
          credential: cert(serviceAccountPath),
        });
      } else {
        throw new Error(`Archivo de service account no encontrado: ${serviceAccountPath}`);
      }
    } 
    // Prioridad 2: Archivo por defecto en src/ (desarrollo)
    else {
      // Buscar en src/ (desarrollo)
      const srcPath = path.resolve(__dirname, "../firebase-service-account.json");
      // Buscar en dist/ (producción compilada)
      const distPath = path.resolve(__dirname, "../../firebase-service-account.json");
      // Buscar en raíz del proyecto
      const rootPath = path.resolve(__dirname, "../../../firebase-service-account.json");
      
      let serviceAccountPath: string | null = null;
      
      if (fs.existsSync(srcPath)) {
        serviceAccountPath = srcPath;
      } else if (fs.existsSync(distPath)) {
        serviceAccountPath = distPath;
      } else if (fs.existsSync(rootPath)) {
        serviceAccountPath = rootPath;
      }
      
      if (serviceAccountPath) {
        console.log("✅ Usando archivo de service account por defecto:", serviceAccountPath);
        
        // Validar que el archivo sea un JSON válido
        try {
          const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
          const parsed = JSON.parse(fileContent);
          
          // Validar campos requeridos
          if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
            throw new Error("El archivo JSON no contiene los campos requeridos: project_id, client_email, private_key");
          }
          
          console.log("   Validación del archivo JSON: OK");
          console.log("   Project ID:", parsed.project_id);
          console.log("   Client Email:", parsed.client_email);
          
          app = initializeApp({
            credential: cert(serviceAccountPath),
          });
        } catch (parseError: any) {
          console.error("❌ Error al leer/validar el archivo JSON:", parseError.message);
          throw new Error(`Archivo JSON inválido o corrupto: ${parseError.message}`);
        }
      }
      // Prioridad 3: Variables de entorno
      else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        console.log("✅ Usando variables de entorno para Firebase");
        
        // Limpiar y formatear la clave privada
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        
        // Reemplazar \\n con saltos de línea reales
        privateKey = privateKey.replace(/\\n/g, "\n");
        
        // Asegurar que la clave tenga el formato correcto
        if (!privateKey.includes("BEGIN PRIVATE KEY") && !privateKey.includes("BEGIN RSA PRIVATE KEY")) {
          console.error("❌ Error: La clave privada no tiene el formato correcto");
          throw new Error("Formato de clave privada inválido");
        }
        
        app = initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        });
      } else {
        throw new Error(
          "No se encontraron credenciales de Firebase. " +
          "Opciones:\n" +
          "1. Coloca 'firebase-service-account.json' en la carpeta src/ del backend\n" +
          "2. Configura FIREBASE_SERVICE_ACCOUNT_PATH en .env\n" +
          "3. Configura las variables de entorno: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
        );
      }
    }
    
    console.log("✅ Firebase Admin inicializado correctamente");
    console.log("   Project ID:", app.options.projectId || "No configurado");
  } catch (error: any) {
    console.error("❌ Error al inicializar Firebase Admin:", error.message);
    console.error("Detalles completos:", error);
    throw error;
  }
} else {
  app = getApps()[0];
  console.log("✅ Firebase Admin ya estaba inicializado");
}

export const firebaseAuth = getAuth(app);
export const firestore = getFirestore(app);
export const db = firestore;
