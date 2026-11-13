# epefi-backend (API)

Express + Firebase, TypeScript.

Las reglas generales están en `../CLAUDE.md`. Ojo con los mensajes de error: se dice "curso", nunca "formación".

## Comandos y deploy

- `npm run dev`: usa ts-node-dev. Es solo para trabajar local.
- `npm run build`: compila con `tsc` a `dist/`. Corre solo en el `postinstall`.
- `npm start`: corre `node dist/index.js`.
- En Render el Start Command tiene que ser **`npm start`**. Si arranca con `npm run dev`, el deploy se corta por timeout de puerto.

## Errores de video — `src/modules/errores-video/routes.ts`
- `POST /api/errores-video` (alumno autenticado). Guarda en Firestore `erroresVideo/{sha1 de la url}`: `url`, curso, módulo, nombre del material, `total` y las últimas 30 ocurrencias (`codigo` de MediaError, uid, email, user agent, conexión).
- Códigos: 2 red, 3 no se pudo decodificar, 4 formato o URL no soportados.
- Admin (`validateUser`): `GET /api/errores-video` (últimos 200 por `ultimaFecha`) y `DELETE /api/errores-video/:id` para marcar como resuelto (borra el registro).

## Exámenes realizados — `src/utils/examenesRealizadosService.ts`
- Orden por `sortBy`/`sortDirection` (alumno, curso, examen, nota, fecha), que se leen en `parseExamenesRealizadosFilters`.
- La búsqueda también matchea el título del curso y del examen.

## Exámenes con muchos alumnos a la vez
- La estructura del curso y el examen se comparten con una caché de 30 s (`src/utils/shortCache.ts`, `examenCache.ts`, `formacionProgress.ts`). Todo cambio en un examen tiene que llamar a `invalidateExamenCache()`. Los cambios en materias o módulos tardan hasta 30 s en verse.
- El envío es idempotente: con `idEnvio`, reenviar devuelve el intento ya guardado (id `uid__idExamen__idEnvio`).
- La respuesta del envío no puede incluir las preguntas, porque llevan `esCorrecta`.
- Los listados de admin usan `select` (`CAMPOS_LISTADO`): si el listado necesita un campo nuevo, agregarlo ahí.
- Los listados de admin también se comparten unos segundos: intentos 10 s (`invalidateExamenesRealizadosListado` al corregir) y usuarios 15 s (lo limpia `index.ts` en cualquier escritura de usuarios, cursos o materias). No modificar los resultados de esas cachés.
- El límite de intentos de login es por cuenta, no por IP.
