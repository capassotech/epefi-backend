// src/middleware/authMiddleware.ts
import type { Request, Response, NextFunction } from "express";
import { firebaseAuth } from "../config/firebase";

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
    role?: string;
  };
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Token no proporcionado" });
      return;
    }

    const token = authHeader.split(" ")[1];

    // Verify token with Firebase
    const decodedToken = await firebaseAuth.verifyIdToken(token);

    // Add user info to request
    (req as AuthenticatedRequest).user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: decodedToken.role,
    };

    next();
  } catch (error: any) {
    console.error("Auth middleware error:", error);

    if (error.code === "auth/id-token-expired") {
      res.status(401).json({ error: "Token expirado" });
      return;
    }
    if (error.code === "auth/id-token-revoked") {
      res.status(401).json({ error: "Token revocado" });
      return;
    }

    res.status(401).json({ error: "Token inválido" });
  }
};
