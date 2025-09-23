// src/types/user.ts
export interface UserRole {
  admin: boolean;
  student: boolean;
}

export interface UserRegistrationData {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  dni: string | number;
}

export interface LoginData {
  email: string;
  password: string;
}
export interface FirebaseAuthResponse {
  localId?: string;
  idToken?: string;
  refreshToken?: string;
  error?: {
    message: string;
    code?: string;
  };
}
export interface UpdateProfileData {
  nombre?: string;
  apellido?: string;
}

export interface User {
  uid: string;
  email: string;
  nombre: string;
  apellido: string;
  dni?: string;
  role: UserRole;
  activo: boolean;
  fechaCreacion: Date;
  fechaUltimoAcceso?: Date;
  fechaUltimoCambioPassword?: Date;
  emailVerificado: boolean;
}

export interface AuthResponse {
  message: string;
  user: {
    uid: string;
    email: string;
    nombre: string;
    apellido: string;
    role: UserRole;
    emailVerificado?: boolean;
  };
}

export interface TokenVerificationResponse {
  valid: boolean;
  user?: {
    uid: string;
    email: string;
    nombre: string;
    apellido: string;
    role: UserRole;
  };
  error?: string;
}
