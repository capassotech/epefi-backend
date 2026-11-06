// Caché en memoria de vida corta para datos que muchos alumnos piden a la vez (curso, examen).
// Los pedidos simultáneos de una misma clave comparten una sola lectura a Firestore.
const entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

export const cached = <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  const entry = entries.get(key);
  if (entry && entry.expiresAt > now) return entry.value as Promise<T>;

  const value = load();
  entries.set(key, { expiresAt: now + ttlMs, value });
  // Un error no se guarda: el siguiente pedido vuelve a intentar
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
};

export const invalidateCached = (prefix: string): void => {
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
};
