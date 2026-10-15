import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "KARHUTLA.AI — Command Center",
  description:
    "Pemantauan kebakaran hutan, verifikasi operator, dan respons virtual.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
