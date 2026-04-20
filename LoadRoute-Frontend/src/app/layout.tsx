import React from 'react'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Tasf.B2B Logistics — Sistema de Ruteo',
  description: 'Sistema de Planificación y Ruteo Logístico de Equipaje — Simulated Annealing & ALNS',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className} suppressHydrationWarning>{children}</body>
    </html>
  )
}
