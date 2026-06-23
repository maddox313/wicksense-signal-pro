import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AppProviders } from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "WickSense Signal Pro",
  description: "Ultimate stock trade detection SaaS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <Sidebar />
          <main className="ml-56 min-h-screen p-6">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
