import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'AccentTalk - Text to Multi-Accent Audio',
    description: 'Convert scripts to multi-accent audio easily without technical constraints.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body>
                {children}
            </body>
        </html>
    )
}
