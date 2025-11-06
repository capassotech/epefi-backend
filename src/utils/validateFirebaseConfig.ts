/**
 * Utilidad para validar la configuración de Firebase antes de inicializar
 */

export function validateFirebaseConfig(): { valid: boolean; error?: string } {
  // Verificar si hay variables de entorno configuradas
  const hasEnvVars = 
    process.env.FIREBASE_PROJECT_ID && 
    process.env.FIREBASE_CLIENT_EMAIL && 
    process.env.FIREBASE_PRIVATE_KEY;

  if (!hasEnvVars) {
    return {
      valid: false,
      error: "Faltan variables de entorno de Firebase. Se requieren: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    };
  }

  // Validar formato de la clave privada
  const privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  
  // Verificar que la clave tenga el formato correcto
  const hasBeginMarker = privateKey.includes("BEGIN PRIVATE KEY") || privateKey.includes("BEGIN RSA PRIVATE KEY");
  const hasEndMarker = privateKey.includes("END PRIVATE KEY") || privateKey.includes("END RSA PRIVATE KEY");
  
  if (!hasBeginMarker || !hasEndMarker) {
    return {
      valid: false,
      error: "La clave privada de Firebase no tiene el formato correcto. Debe incluir 'BEGIN PRIVATE KEY' y 'END PRIVATE KEY'"
    };
  }

  // Verificar que la clave no esté vacía o solo tenga espacios
  if (privateKey.trim().length < 100) {
    return {
      valid: false,
      error: "La clave privada parece estar incompleta o vacía"
    };
  }

  return { valid: true };
}

