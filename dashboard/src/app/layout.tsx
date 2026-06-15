import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import DashboardLayout from "./dashboard-layout";

// Humanist sans for UI / body
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Editorial serif for display / headings — gives the boutique, human-made feel
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "SuiteTalk — Concierge",
  description: "AI voice concierge for the hotel front desk",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${fraunces.variable} antialiased`}>
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}
