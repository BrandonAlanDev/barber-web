// app/api/mercadopago/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Payment } from "mercadopago";
import { obtenerClienteMP } from "@/lib/mercadopago";

const mp = await obtenerClienteMP();

// Mercado Pago envía las notificaciones como POST
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("📩 Webhook MP recibido:", JSON.stringify(body, null, 2));

    // MP puede enviar dos tipos de notificaciones:
    // 1. IPN clásica: { id, topic }
    // 2. Webhooks modernos: { type, data: { id } }
    const paymentId =
      body?.data?.id ||      // webhook moderno
      (body?.topic === "payment" ? body?.id : null); // IPN clásica

    if (!paymentId) {
      // Puede ser una notificación de otro tipo (merchant_order, etc.)
      console.log("ℹ️ Webhook sin paymentId, tipo:", body?.type || body?.topic);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Consultar los detalles del pago a la API de MP
    const payment = new Payment(mp);
    const paymentData = await payment.get({ id: paymentId });

    console.log("💳 Datos del pago:", {
      id: paymentData.id,
      status: paymentData.status,
      external_reference: paymentData.external_reference,
      amount: paymentData.transaction_amount,
    });

    const turnoId = paymentData.external_reference;

    if (!turnoId) {
      console.error("❌ Pago sin external_reference (turnoId)");
      return NextResponse.json({ error: "No turnoId" }, { status: 400 });
    }

    // Manejar los distintos estados de pago
    switch (paymentData.status) {
      case "approved": {
        // Pago aprobado → confirmar el turno
        await prisma.turno.update({
          where: { id: turnoId },
          data: {
            estado: "CONFIRMADO",
            ...(paymentData.id ? { mpPaymentId: String(paymentData.id) } as any : {}),
          },
        });
        console.log(`✅ Turno ${turnoId} CONFIRMADO por pago ${paymentData.id}`);
        break;
      }

      case "pending":
      case "in_process": {
        // Pago pendiente → turno sigue PENDIENTE, guardar el paymentId si el campo existe
        try {
          await (prisma.turno as any).update({
            where: { id: turnoId },
            data: { mpPaymentId: String(paymentData.id) },
          });
        } catch { /* campo aún no migrado */ }
        console.log(`⏳ Pago ${paymentData.id} pendiente para turno ${turnoId}`);
        break;
      }

      case "rejected":
      case "cancelled": {
        // Pago rechazado/cancelado → turno vuelve a PENDIENTE sin paymentId confirmado
        await prisma.turno.update({
          where: { id: turnoId },
          data: { estado: "PENDIENTE" },
        });
        console.log(`❌ Pago rechazado/cancelado para turno ${turnoId}`);
        break;
      }

      case "refunded":
      case "charged_back": {
        // Devolución → cancelar el turno
        await prisma.turno.update({
          where: { id: turnoId },
          data: { estado: "CANCELADO" },
        });
        console.log(`↩️ Turno ${turnoId} CANCELADO por devolución/contracargo`);
        break;
      }

      default:
        console.log(`ℹ️ Estado de pago no manejado: ${paymentData.status}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("❌ Error en webhook MP:", error);
    // Siempre retornar 200 para que MP no reintente indefinidamente
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

// MP también puede enviar GET para validar la URL
export async function GET(req: NextRequest) {
  return NextResponse.json({ status: "MP Webhook activo" }, { status: 200 });
}