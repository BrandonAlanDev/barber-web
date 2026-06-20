"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Link2, Unlink, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { desconectarMP, type EstadoConexionMP } from "@/actions/mercadopago-oauth.actions";

interface Props {
  estadoInicial: EstadoConexionMP;
}

const MENSAJES_ERROR: Record<string, string> = {
  bloqueado:
    "La conexión está bloqueada por seguridad. Pedile al equipo de desarrollo que la desbloquee.",
  estado_invalido: "La sesión de conexión expiró, intentá de nuevo.",
  sin_codigo: "Mercado Pago no devolvió autorización, intentá de nuevo.",
  conexion_fallida: "No se pudo completar la conexión con Mercado Pago.",
};

export default function MercadoPagoConnectionPanel({ estadoInicial }: Props) {
  const [estado, setEstado] = useState(estadoInicial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("mp_success")) {
      toast.success("¡Cuenta de Mercado Pago conectada correctamente!");
      router.replace("/admin/mercadopago");
    }

    const codigoError = searchParams.get("mp_error");
    if (codigoError) {
      toast.error(MENSAJES_ERROR[codigoError] || "No se pudo conectar la cuenta de Mercado Pago");
      router.replace("/admin/mercadopago");
    }
  }, [searchParams, router]);

  const manejarDesconexion = () => {
    if (!confirm("¿Seguro que querés desconectar la cuenta de Mercado Pago?")) return;

    startTransition(async () => {
      const resultado = await desconectarMP();
      if (resultado.success) {
        toast.success("Cuenta desconectada");
        setEstado({
          conectado: false,
          bloqueado: false,
          publicKey: null,
          mpUserId: null,
          liveMode: null,
          actualizadoEn: null,
        });
      } else {
        toast.error(resultado.error || "Error al desconectar");
      }
    });
  };

  return (
    <div className="bg-black/40 backdrop-blur-lg border border-amber-900/30 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {estado.conectado ? (
            <CheckCircle2 className="h-6 w-6 text-green-500" />
          ) : (
            <XCircle className="h-6 w-6 text-red-500" />
          )}
          <div>
            <p className="font-semibold text-white">
              {estado.conectado ? "Cuenta conectada" : "Sin conectar"}
            </p>
            <p className="text-xs text-amber-200/60">
              {estado.conectado
                ? "Los pagos de seña se acreditan en esta cuenta"
                : "Conectá una cuenta para poder cobrar señas"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {estado.bloqueado && (
            <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Lock className="h-3 w-3" />
              BLOQUEADA
            </span>
          )}
          {estado.conectado && (
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              {estado.liveMode ? "PRODUCCIÓN" : "PRUEBA"}
            </span>
          )}
        </div>
      </div>

      {estado.conectado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t border-amber-900/30 pt-4">
          <div>
            <p className="text-amber-200/50 text-xs uppercase tracking-wider mb-1">
              Usuario de Mercado Pago
            </p>
            <p className="text-white font-mono">{estado.mpUserId}</p>
          </div>
          <div>
            <p className="text-amber-200/50 text-xs uppercase tracking-wider mb-1">
              Última actualización
            </p>
            <p className="text-white">
              {estado.actualizadoEn
                ? new Date(estado.actualizadoEn).toLocaleString("es-AR")
                : "-"}
            </p>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-amber-900/30">
        {estado.bloqueado ? (
          <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <Lock className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-200/70 leading-relaxed">
              Esta conexión está <strong className="text-amber-400">bloqueada por seguridad</strong> para
              evitar que se cambien los tokens sin autorización. Si necesitás conectar otra cuenta,
              pedile al equipo de desarrollo que desbloquee la configuración.
            </p>
          </div>
        ) : estado.conectado ? (
          <button
            onClick={manejarDesconexion}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors text-sm font-semibold disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            Desconectar cuenta
          </button>
        ) : (
          <a
            href="/api/mercadopago/oauth/start"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#009EE3] hover:bg-[#0088CC] text-white text-sm font-bold transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Conectar con Mercado Pago
          </a>
        )}
      </div>
    </div>
  );
}