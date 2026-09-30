import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI POWERED CHAT BOT",
  description:
    "Chat with an intelligent AI bot. Voice input, read-aloud, and instant replies.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${fontSans.variable}`}>
      <body className={`${fontSans.className} min-h-full flex flex-col`}>{children}</body>
    </html>
  );
}
