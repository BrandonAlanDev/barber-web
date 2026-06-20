import { Suspense } from "react";
import { ArrowLeft, CreditCard } from "lucide-react";
import Link from "next/link";
import { obtenerEstadoConexionMP } from "@/actions/mercadopago-oauth.actions";
import MercadoPagoConnectionPanel from "@/components/admin/MercadoPagoConnectionPanel";

export default async function MercadoPagoConfigPage() {
  const estado = await obtenerEstadoConexionMP();

  return (
    <div className="min-h-screen bg-gradient-to-br from-black to-amber-950/30 p-6">
      <div className="container mx-auto max-w-3xl mt-20">
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/admin"
            className="p-2 hover:bg-amber-600/20 rounded-lg transition-all group"
            title="Volver al Dashboard"
          >
            <ArrowLeft className="h-6 w-6 text-amber-500 group-hover:text-amber-400 group-hover:-translate-x-1 transition-all" />
          </Link>

          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl border-2 border-amber-500/30">
              <CreditCard className="h-8 w-8 text-amber-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Mercado Pago</h1>
              <p className="text-amber-200/70">
                Conectá tu cuenta para poder cobrar las señas de los turnos
              </p>
            </div>
          </div>
        </div>

        <Suspense fallback={<p className="text-amber-200/50">Cargando estado de conexión...</p>}>
          <MercadoPagoConnectionPanel estadoInicial={estado} />
        </Suspense>
      </div>
    </div>
  );
}