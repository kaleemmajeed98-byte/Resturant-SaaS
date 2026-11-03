import type { Metadata } from "next";
import "./globals.css";
import "./enterprise.css";

export const metadata: Metadata = { title: "Tablecraft — Restaurant websites, made simple", description: "A better home for every independent restaurant. Build your site, publish your menu, and bring every order together." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
