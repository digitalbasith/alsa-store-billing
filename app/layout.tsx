import type { Metadata } from "next";
import "./globals.css";
import "./firebase.css";
import { PwaRegister } from "./pwa-register";
import { ForgotPasswordHelper } from "./forgot-password-helper";

export const metadata: Metadata = {
  title: "Alsa Store Billing",
  description:
    "Bilingual supermarket billing, inventory, purchases and business reports.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased"><PwaRegister /><ForgotPasswordHelper />{children}</body>
    </html>
  );
}
