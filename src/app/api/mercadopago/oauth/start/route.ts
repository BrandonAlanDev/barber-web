import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { construirUrlAutorizacionMP, estaBloqueadaMP } from "@/lib/mercadopago";

/**
 * Inicia el flujo: si la configuración está bloqueada, ni siquiera manda
 * al admin a Mercado Pago. Si no, genera un "state" anti-CSRF y redirige.
 */
export async function GET(req: NextRequest) {
  const urlAdmin = new URL("/admin/mercadopago", req.url);

  try {
    const bloqueada = await estaBloqueadaMP();
    if (bloqueada) {
      urlAdmin.searchParams.set("mp_error", "bloqueado");
      return NextResponse.redirect(urlAdmin);
    }

    const estado = randomUUID();
    const urlAutorizacion = construirUrlAutorizacionMP(estado);

    const respuesta = NextResponse.redirect(urlAutorizacion);

    respuesta.cookies.set("mp_oauth_state", estado, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10, // 10 minutos
      path: "/",
    });

    return respuesta;
  } catch (error) {
    console.error("Error al iniciar conexión con Mercado Pago:", error);
    urlAdmin.searchParams.set("mp_error", "1");
    return NextResponse.redirect(urlAdmin);
  }
}