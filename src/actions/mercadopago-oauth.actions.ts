"use server";

import { revalidatePath } from "next/cache";
import { obtenerConfiguracionMP, eliminarConfiguracionMP } from "@/lib/mercadopago";

export type EstadoConexionMP = {
  conectado: boolean;
  bloqueado: boolean;
  publicKey: string | null;
  mpUserId: string | null;
  liveMode: boolean | null;
  actualizadoEn: string | null;
};

/** Devuelve el estado de la conexión, sin exponer los tokens sensibles */
export async function obtenerEstadoConexionMP(): Promise<EstadoConexionMP> {
  const configuracion = await obtenerConfiguracionMP();

  if (!configuracion) {
    return {
      conectado: false,
      bloqueado: false,
      publicKey: null,
      mpUserId: null,
      liveMode: null,
      actualizadoEn: null,
    };
  }

  return {
    conectado: configuracion.conectado,
    bloqueado: configuracion.bloqueado,
    publicKey: configuracion.publicKey,
    mpUserId: configuracion.mpUserId,
    liveMode: configuracion.liveMode,
    actualizadoEn: configuracion.updatedAt.toISOString(),
  };
}

/** Desconecta la cuenta de Mercado Pago. Falla si la configuración está bloqueada. */
export async function desconectarMP() {
  try {
    await eliminarConfiguracionMP();
    revalidatePath("/admin/mercadopago");
    return { success: true };
  } catch (error: any) {
    console.error("Error al desconectar Mercado Pago:", error);
    return {
      success: false,
      error: error?.message || "No se pudo desconectar la cuenta",
    };
  }
}