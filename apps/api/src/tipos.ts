/** Sesión de Supabase válida (el email todavía puede no tener acceso). */
export interface Sesion {
  email: string;
  /** Nombre que trae la cuenta de Google, si hay. */
  nombreSugerido: string | null;
}

/** Usuario registrado, con la organización sobre la que opera el request. */
export interface Usuario {
  email: string;
  /** Organización activa; null para un superadmin sin membresías. */
  organizationId: string | null;
  organizations: { id: string; name: string }[];
  roles: unknown[];
  esSuperadmin: boolean;
  /** Ids de las organizaciones que administra (todas, si es superadmin). */
  organizacionesAdministradas: string[];
}

/** Variables que los middlewares dejan en el contexto de Hono. */
export interface AppEnv {
  Variables: {
    sesion: Sesion;
    usuario: Usuario;
    /** Sólo en rutas con requiereOrganizacion. */
    organizacionId: string;
  };
}
