import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "vazirmatn/Vazirmatn-font-face.css";
import "./globals.css";
import { ModeProvider } from "@/components/ModeProvider";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "کلینیک‌یاب | یافتن ایمیل بیمارستان‌های آلمان",
  description: "یافتن روزانه ایمیل مدیران پرستاری و جذب نیرو در بیمارستان‌های آلمان برای OTA و ATA و ارسال خودکار ایمیل برای کلاینت‌ها",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-mode="OTA">
      <body className="font-sans text-slate-800 antialiased">
        <ModeProvider>
          <Shell>{children}</Shell>
        </ModeProvider>
      </body>
    </html>
  );
}
