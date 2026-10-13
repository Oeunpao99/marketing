import { useAuth } from '../auth'
import ChatbotIntakeCard from '../components/setup/ChatbotIntakeCard'
import ChatLinkCard from '../components/setup/ChatLinkCard'
import SalesAlertsCard from '../components/setup/SalesAlertsCard'
import { useStore } from '../store'

// Setup → Bot setup: everything about the chatbot in one place — its leads
// coming in (intake key), the chat link added to every post, and the sales
// team's Telegram alerts. These used to sit on the Channels page.
export default function BotSetupPage() {
  const { user } = useAuth()
  const { activeBrand } = useStore()
  const canManage = user?.role === 'owner' || user?.role === 'admin'

  return (
    <div className="w-full px-5 lg:px-10 py-8 lg:py-10 animate-fadein">
      <div className="mb-6">
        <h1 className="page-title">Bot setup</h1>
        <p className="page-sub mt-1">
          Connect your chatbot: its conversations become leads, every post links to it, and your sales team hears about
          each lead in Telegram.
        </p>
      </div>
      <ChatbotIntakeCard canManage={canManage} />
      <ChatLinkCard brandSlug={activeBrand} />
      <SalesAlertsCard canManage={canManage} />
    </div>
  )
}
