import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "اقرأ";

export const metadata: Metadata = {
  title: appName,
  description: "تطبيق متابعة حلقة تحفيظ القرآن الكريم",
  icons: {
    icon: "/15044096.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
