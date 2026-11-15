import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "m1cro.ai — The AI Engineering Workspace",
  description: "One engineering workspace. Any model. Multiple agents.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
