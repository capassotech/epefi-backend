import { NextFunction, Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, authMiddleware } from '../../middleware/authMiddleware';
import { getUser, getUsers, getUserProfile, deleteUser, updateUser, updateProfile, asignCourseToUser, createUser, getStudentModules, updateStudentModule, markContentAsCompleted, getStudentProgress } from './controller';
import { UpdateUserSchema, UserSchema, UpdateProfileSchema } from '../../types/schemas';
import { validateBody, basicSanitization } from '../../middleware/zodValidation';

const router = Router();

// IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros
router.get('/me', 
  authMiddleware, 
  (req: Request, res: Response) => getUserProfile(req as AuthenticatedRequest, res)
);

// Ruta para que el usuario actualice su propio perfil
router.put('/me', 
  authMiddleware,
  basicSanitization,
  validateBody(UpdateProfileSchema),
  (req: Request, res: Response) => updateProfile(req as AuthenticatedRequest, res)
);

// Ruta raíz debe ir ANTES de /:id
router.get('/', 
  authMiddleware, 
  (req: Request, res: Response) => getUsers(req as AuthenticatedRequest, res)
);

router.post('/', 
  authMiddleware, 
  validateBody(UserSchema), 
  (req: Request, res: Response) => createUser(req as AuthenticatedRequest, res)
);

// IMPORTANTE: Las rutas específicas con más segmentos deben ir ANTES de /:id
// Rutas para gestión de módulos por estudiante (deben ir antes de /:id)
router.get('/:id/modulos', 
  authMiddleware, 
  (req: Request, res: Response) => getStudentModules(req as AuthenticatedRequest, res)
);

router.patch('/:id/modulos/:moduleId', 
  authMiddleware,
  validateBody(z.object({ enabled: z.boolean() })),
  (req: Request, res: Response) => updateStudentModule(req as AuthenticatedRequest, res)
);

// Rutas para progreso del estudiante
router.post('/:id/progreso', 
  authMiddleware,
  validateBody(z.object({ 
    moduleId: z.string(),
    contentIndex: z.number(),
    contentType: z.enum(['video', 'document']),
    completed: z.boolean()
  })),
  (req: Request, res: Response) => markContentAsCompleted(req as AuthenticatedRequest, res)
);

router.get('/:id/progreso', 
  authMiddleware,
  (req: Request, res: Response) => getStudentProgress(req as AuthenticatedRequest, res)
);

router.post('/:id/asignar-curso', 
  authMiddleware, 
  (req: Request, res: Response) => asignCourseToUser(req as AuthenticatedRequest, res)
);

// Ruta con parámetro debe ir DESPUÉS de las rutas específicas
router.get('/:id', 
  authMiddleware, 
  (req: Request, res: Response) => getUser(req as AuthenticatedRequest, res)
);

router.delete('/:id', 
  authMiddleware, 
  (req: Request, res: Response) => deleteUser(req as AuthenticatedRequest, res)
);

router.put('/:id', 
  authMiddleware, 
  validateBody(UpdateUserSchema), 
  (req: Request, res: Response) => updateUser(req as AuthenticatedRequest, res)
);

export default router;
