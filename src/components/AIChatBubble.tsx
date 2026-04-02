import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AIChatBubbleProps {
  onClick: () => void
  isOpen: boolean
}

export function AIChatBubble({ onClick, isOpen }: AIChatBubbleProps) {
  if (isOpen) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 lg:hidden no-print">
      <Button
        size="icon-lg"
        onClick={onClick}
        className="rounded-full size-14 shadow-lg bg-blue-500 hover:bg-blue-600 text-white"
      >
        <Sparkles className="size-6" />
      </Button>
    </div>
  )
}
