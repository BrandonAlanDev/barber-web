"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Preference } from "mercadopago";
import { obtenerClienteMP } from "@/lib/mercadopago";

// ============================
// CONFIGURACIÓN DEL CLIENTE MP
// ============================
export type ActionState = {
  success: boolean;
  error?: string;
  data?: any;
};

// ======================================================
// CREATE PREFERENCE
// Crea la preferencia de pago en MP para la seña de un turno
// ======================================================
export async function crearPreferenciaPago(turnoId: string): Promise<ActionState> {
  try {
    if (!turnoId) {
      return { success: false, error: "ID de turno inválido" };
    }

    // Obtener el turno con toda la info necesaria
    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      include: {
        user: { select: { name: true, email: true } },
        servicio: { select: { nombre: true, descripcion: true } },
        barbero: { select: { nombre: true } },
      },
    });

    if (!turno) {
      return { success: false, error: "Turno no encontrado" };
    }

    if (turno.estado === "CONFIRMADO") {
      return { success: false, error: "Este turno ya fue pagado" };
    }

    if (turno.estado === "CANCELADO") {
      return { success: false, error: "Este turno está cancelado" };
    }

    const seniaAmount = Number(turno.seniaCongelada);

    if (seniaAmount <= 0) {
      return { success: false, error: "Este servicio no requiere seña" };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const isProduction = process.env.NODE_ENV === "production";
    const mp = await obtenerClienteMP();
    const preference = new Preference(mp);

    const body = {
      items: [
        {
          id: turnoId,
          title: `Seña - ${turno.servicio.nombre}`,
          description: `Turno con ${turno.barbero.nombre} | ${turno.horarioReservado.toLocaleString("es-AR", {
            timeZone: "America/Argentina/Buenos_Aires",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          quantity: 1,
          unit_price: seniaAmount,
          currency_id: "ARS",
        },
      ],
      payer: {
        name: turno.user.name ?? "Cliente",
        email: turno.user.email ?? "cliente@email.com",
      },
      back_urls: {
        success: `${baseUrl}/pago/success?turnoId=${turnoId}`,
        failure: `${baseUrl}/pago/failure?turnoId=${turnoId}`,
        pending: `${baseUrl}/pago/pending?turnoId=${turnoId}`,
      },
      // auto_return solo funciona con URLs públicas (no localhost).
      // En producción lo activamos para redirigir automáticamente al usuario.
      ...(isProduction && { auto_return: "approved" as const }),
      notification_url: `${baseUrl}/api/mercadopago/webhook`,
      external_reference: turnoId,
      // Vence en 5 minutos para evitar que el usuario pague una seña vieja
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    const response = await preference.create({ body });

    if (!response.id) {
      return { success: false, error: "No se pudo crear la preferencia de pago" };
    }

    // Guardar el preference ID en el turno para tracking
    // (requiere haber corrido: npx prisma migrate dev --name add_mp_fields)
    try {
      await (prisma.turno as any).update({
        where: { id: turnoId },
        data: { mpPreferenceId: response.id },
      });
    } catch {
      // Campo mpPreferenceId aún no existe en el schema — ignorar
    }

    return {
      success: true,
      data: {
        preferenceId: response.id,
        // Para producción se usa init_point, para sandbox sandbox_init_point
        checkoutUrl: response.init_point,
        initPoint: response.init_point,
        sandboxInitPoint: response.sandbox_init_point,
      },
    };
  } catch (error: any) {
    console.error("❌ Error creando preferencia MP:", error);
    return {
      success: false,
      error: error?.message ?? "Error al crear el pago",
    };
  }
}

// ======================================================
// CONFIRMAR PAGO MANUAL (fallback desde back_url success)
// Se llama desde la página /pago/success como respaldo
// ======================================================
export async function confirmarPagoTurno(
  turnoId: string,
  paymentId?: string
): Promise<ActionState> {
  try {
    if (!turnoId) {
      return { success: false, error: "ID de turno inválido" };
    }

    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
    });

    if (!turno) {
      return { success: false, error: "Turno no encontrado" };
    }

    // Si ya está confirmado, no hacer nada
    if (turno.estado === "CONFIRMADO") {
      return { success: true, data: turno };
    }

    // Actualizar turno
    const turnoActualizado = await prisma.turno.update({
      where: { id: turnoId },
      data: {
        estado: "CONFIRMADO",
        // mpPaymentId solo si el campo existe en el schema
        ...(paymentId ? { mpPaymentId: paymentId } as any : {}),
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/turno");
    revalidatePath("/admin");

    return {
      success: true,
      data: {
        ...turnoActualizado,
        precioCongelado: Number(turnoActualizado.precioCongelado),
        seniaCongelada: Number(turnoActualizado.seniaCongelada),
      },
    };
  } catch (error: any) {
    console.error("❌ Error confirmando pago:", error);
    return {
      success: false,
      error: error?.message ?? "Error al confirmar el pago",
    };
  }
}

// ======================================================
// VERIFICAR ESTADO DE PAGO (desde el cliente)
// ======================================================
export async function verificarEstadoPago(turnoId: string): Promise<ActionState> {
  try {
    const turno = await prisma.turno.findUnique({
      where: { id: turnoId },
      select: {
        id: true,
        estado: true,
        seniaCongelada: true,
      },
    });

    if (!turno) {
      return { success: false, error: "Turno no encontrado" };
    }

    return {
      success: true,
      data: {
        id: turno.id,
        estado: turno.estado,
        seniaCongelada: Number(turno.seniaCongelada),
        // Estos campos son opcionales — existen solo si corriste la migración add_mp_fields
        mpPaymentId: (turno as any).mpPaymentId ?? null,
        mpPreferenceId: (turno as any).mpPreferenceId ?? null,
      },
    };
  } catch (error: any) {
    return { success: false, error: "Error al verificar el pago" };
  }
}