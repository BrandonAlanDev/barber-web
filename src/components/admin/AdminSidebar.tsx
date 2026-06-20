// components/admin/AdminSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Scissors, 
  Users, 
  Calendar, 
  ClipboardList,
  Clock,
  CreditCard
} from "lucide-react";

const menuItems = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Barberos", href: "/barbero", icon: Users },
  { title: "Servicios", href: "/servicio", icon: Scissors },
  { title: "Turnos", href: "/turno", icon: Calendar },
  { title: "Días Laborales", href: "/diaLaboral", icon: Clock },
  { title: "Excepciones", href: "/excepcionesLaborales", icon: ClipboardList },
  { title: "Mercado Pago", href: "/admin/mercadopago", icon: CreditCard },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-black/40 backdrop-blur-lg border-r border-amber-900/30 flex flex-col fixed left-0 top-0 h-screen pt-20 shadow-xl">
      
      {/* Header */}
      <div className="p-4 border-b border-amber-900/30">
        <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        <p className="text-xs text-amber-200/60 mt-1">
          Gestión de barbería
        </p>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-sm font-semibold transition-all duration-200 group
                ${
                  isActive
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner"
                    : "text-amber-200/70 hover:bg-amber-500/10 hover:text-amber-400"
                }
              `}
            >
              <Icon
                className={`h-5 w-5 transition-colors ${
                  isActive
                    ? "text-amber-400"
                    : "text-amber-200/70 group-hover:text-amber-400"
                }`}
              />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}