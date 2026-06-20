import "dotenv/config";
import MercadoPagoConfig from "mercadopago";
import { prisma } from "@/lib/prisma";

// ID fijo: solo necesitamos una fila de configuración (la cuenta conectada del negocio)
const ID_CONFIGURACION_MP = "mercadopago-principal";

const URL_AUTORIZACION_BASE =
  process.env.MP_AUTH_BASE_URL || "https://auth.mercadopago.com.ar";
const URL_TOKEN_MP = "https://api.mercadopago.com/oauth/token";

function obtenerRedirectUri(): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/mercadopago/oauth/callback`;
}

/**
 * Construye la URL a la que se manda al admin para que autorice
 * nuestra aplicación desde su cuenta de Mercado Pago.
 */
export function construirUrlAutorizacionMP(estado: string): string {
  const clientId = process.env.MP_CLIENT_ID;

  if (!clientId) {
    throw new Error(
      "Falta configurar MP_CLIENT_ID en las variables de entorno",
    );
  }

  const parametros = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    platform_id: "mp",
    redirect_uri: obtenerRedirectUri(),
    state: estado,
  });

  return `${URL_AUTORIZACION_BASE}/authorization?${parametros.toString()}`;
}

type RespuestaTokenMP = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  user_id?: number;
  refresh_token?: string;
  public_key?: string;
  live_mode?: boolean;
};

/**
 * Intercambia el "code" que devuelve Mercado Pago por los tokens
 * reales de la cuenta que se está conectando.
 */
export async function intercambiarCodigoPorToken(
  codigo: string,
): Promise<RespuestaTokenMP> {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Faltan MP_CLIENT_ID o MP_CLIENT_SECRET en las variables de entorno",
    );
  }

  const respuesta = await fetch(URL_TOKEN_MP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: codigo,
      redirect_uri: obtenerRedirectUri(),
    }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    console.error("❌ Error al intercambiar código MP:", datos);
    throw new Error(datos?.message || "No se pudo conectar con Mercado Pago");
  }

  return datos as RespuestaTokenMP;
}

/** Lee la configuración guardada (o null si nunca se conectó nada) */
export async function obtenerConfiguracionMP() {
  return prisma.configuracion_mercadopago.findUnique({
    where: { id: ID_CONFIGURACION_MP },
  });
}

/**
 * 🔒 Indica si la configuración actual está bloqueada.
 * Mientras esté bloqueada, no se puede ni reconectar ni desconectar la cuenta
 * desde el panel — la única forma de destrabarla es que el equipo de
 * desarrollo cambie este valor a `false` directamente en la base de datos.
 */
export async function estaBloqueadaMP(): Promise<boolean> {
  const configuracion = await obtenerConfiguracionMP();
  return configuracion?.bloqueado ?? false;
}

type OpcionesGuardarMP = {
  /** Si es true (default), la configuración queda bloqueada después de guardar */
  bloquearDespuesDeGuardar?: boolean;
};

/**
 * Guarda (o actualiza) en la base de datos la cuenta conectada.
 * Es de "bajo nivel": no valida el bloqueo, eso lo decide quien la llama
 * (conectarCuentaMP sí lo valida, refrescarTokenMP no).
 */
export async function guardarConfiguracionMP(
  datos: RespuestaTokenMP,
  opciones: OpcionesGuardarMP = {},
) {
  const { bloquearDespuesDeGuardar = true } = opciones;

  const expiraEn = datos.expires_in
    ? new Date(Date.now() + datos.expires_in * 1000)
    : null;

  await prisma.configuracion_mercadopago.upsert({
    where: { id: ID_CONFIGURACION_MP },
    create: {
      id: ID_CONFIGURACION_MP,
      accessToken: datos.access_token,
      refreshToken: datos.refresh_token ?? null,
      publicKey: datos.public_key ?? null,
      mpUserId: datos.user_id ? String(datos.user_id) : null,
      scope: datos.scope ?? null,
      liveMode: datos.live_mode ?? true,
      expiraEn,
      conectado: true,
      bloqueado: bloquearDespuesDeGuardar,
    },
    update: {
      accessToken: datos.access_token,
      refreshToken: datos.refresh_token ?? null,
      publicKey: datos.public_key ?? null,
      mpUserId: datos.user_id ? String(datos.user_id) : null,
      scope: datos.scope ?? null,
      liveMode: datos.live_mode ?? true,
      expiraEn,
      conectado: true,
      bloqueado: bloquearDespuesDeGuardar,
    },
  });
}

/**
 * 🔒 Flujo "de alto nivel" para conectar/reconectar una cuenta.
 * Es lo que usa el callback de OAuth. Si la configuración está bloqueada,
 * rechaza la operación antes de guardar nada.
 */
export async function conectarCuentaMP(codigo: string) {
  const bloqueada = await estaBloqueadaMP();

  if (bloqueada) {
    throw new Error(
      "La configuración de Mercado Pago está bloqueada por seguridad. Pedile al equipo de desarrollo que la desbloquee antes de conectar otra cuenta.",
    );
  }

  const tokens = await intercambiarCodigoPorToken(codigo);

  // Cada conexión nueva/reconexión vuelve a bloquear la configuración automáticamente
  await guardarConfiguracionMP(tokens, { bloquearDespuesDeGuardar: true });

  return tokens;
}

/**
 * Usa el refresh_token guardado para renovar el access_token
 * antes de que expire (los tokens de OAuth de MP duran ~180 días).
 * El bloqueo NO se modifica acá: es la misma cuenta, no un cambio de credenciales.
 */
export async function refrescarTokenMP(): Promise<RespuestaTokenMP> {
  const configuracion = await obtenerConfiguracionMP();
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;

  if (!configuracion?.refreshToken) {
    throw new Error("No hay refresh_token guardado para renovar la conexión");
  }
  if (!clientId || !clientSecret) {
    throw new Error("Faltan MP_CLIENT_ID o MP_CLIENT_SECRET");
  }

  const respuesta = await fetch(URL_TOKEN_MP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: configuracion.refreshToken,
    }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    console.error("❌ Error al refrescar token MP:", datos);
    throw new Error("No se pudo renovar la conexión con Mercado Pago");
  }

  await guardarConfiguracionMP(datos, {
    bloquearDespuesDeGuardar: configuracion.bloqueado, // preserva el estado de bloqueo actual
  });

  return datos as RespuestaTokenMP;
}

/**
 * 🔒 Borra la conexión guardada (botón "Desconectar").
 * Lanza un error si la configuración está bloqueada.
 */
export async function eliminarConfiguracionMP() {
  const bloqueada = await estaBloqueadaMP();

  if (bloqueada) {
    throw new Error(
      "La configuración de Mercado Pago está bloqueada por seguridad. Pedile al equipo de desarrollo que la desbloquee antes de desconectar la cuenta.",
    );
  }

  await prisma.configuracion_mercadopago.deleteMany({
    where: { id: ID_CONFIGURACION_MP },
  });
}

/**
 * Devuelve un cliente de Mercado Pago listo para usar.
 * Prioriza la cuenta conectada por OAuth (guardada en la DB);
 * si todavía no se conectó ninguna, cae al MP_ACCESS_TOKEN del .env.
 */
export async function obtenerClienteMP(): Promise<MercadoPagoConfig> {
  const configuracion = await obtenerConfiguracionMP();
  const accessToken = configuracion?.accessToken || process.env.MP_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error(
      "No hay ninguna cuenta de Mercado Pago conectada ni token configurado",
    );
  }

  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 },
  });
}