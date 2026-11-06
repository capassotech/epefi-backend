# epefi-backend (API)

Express + Firebase, TypeScript.

Las reglas generales están en `../CLAUDE.md`. Ojo con los mensajes de error: se dice "curso", nunca "formación".

## Comandos y deploy

- `npm run dev`: usa ts-node-dev. Es solo para trabajar local.
- `npm run build`: compila con `tsc` a `dist/`. Corre solo en el `postinstall`.
- `npm start`: corre `node dist/index.js`.
- En Render el Start Command tiene que ser **`npm start`**. Si arranca con `npm run dev`, el deploy se corta por timeout de puerto.

## Exámenes realizados — `src/utils/examenesRealizadosService.ts`
- Orden por `sortBy`/`sortDirection` (alumno, curso, examen, nota, fecha), que se leen en `parseExamenesRealizadosFilters`.
- La búsqueda también matchea el título del curso y del examen.
