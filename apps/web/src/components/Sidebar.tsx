"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LineChart,
  ScanSearch,
  FlaskConical,
  BarChart3,
  PieChart,
  ListTree,
  User,
  Settings,
  Zap,
  LayoutGrid,
  Wallet,
  Archive,
} from "lucide-react";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/account", label: "Account", icon: Wallet },
  { href: "/chart", label: "Chart", icon: LineChart },
  { href: "/multi-chart", label: "Multi-Chart", icon: LayoutGrid },
  { href: "/scanner", label: "Scanner", icon: ScanSearch },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/performance", label: "Trade Analysis", icon: BarChart3 },
  { href: "/trade-archive", label: "Trade Archive", icon: Archive },
  { href: "/performance-analysis", label: "Performance Analysis", icon: PieChart },
  { href: "/strategy-performance", label: "Strategy Breakdown", icon: ListTree },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-56 flex-col border-r border-[var(--card-border)] bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--card-border)] px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]">
          <Zap className="h-4 w-4 text-black" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">WickSense</p>
          <p className="text-[10px] text-[var(--muted)]">Signal Pro</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <SyncStatusIndicator />
      <div className="border-t border-[var(--card-border)] px-4 py-2">
        <p className="text-[10px] text-[var(--muted)]">v0.1.0 MVP</p>
      </div>
    </aside>
  );
}
