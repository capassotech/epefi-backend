import { NextFunction, Router, Request, Response } from 'express';
import { AuthenticatedRequest, authMiddleware } from '../../middleware/authMiddleware';
import { getUser, getUsers, getUserProfile, deleteUser, updateUser, asignCourseToUser, createUser } from './controller';
import { UpdateUserSchema, UserSchema } from '../../types/schemas';
import { validateBody } from '../../middleware/zodValidation';

const router = Router();


router.get('/me', authMiddleware, getUserProfile);

router.get('/:id', 
  authMiddleware, 
  (req: Request, res: Response) => getUser(req as AuthenticatedRequest, res)
);

router.get('/', 
  authMiddleware, 
  (req: Request, res: Response) => getUsers(req as AuthenticatedRequest, res)
);

router.post('/', 
  authMiddleware, 
  validateBody(UserSchema), 
  (req: Request, res: Response) => createUser(req as AuthenticatedRequest, res)
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

router.post('/:id/asignar-curso', 
  authMiddleware, 
  (req: Request, res: Response) => asignCourseToUser(req as AuthenticatedRequest, res)
);

export default router;
