'use client';
import dynamic from 'next/dynamic'

const PlayClient = dynamic(() => import('./PlayClient'), { ssr: false })

export default function PlayPage() {
  return <PlayClient />
}
