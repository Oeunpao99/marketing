// /upgrade — the plans as their own page (from Settings → Billing → Upgrade, the
// account menu, a "payment received" notification): the plan cards, then the KHQR
// and the thank-you on the same page (components/billing/UpgradeDialog page mode).
import { useNavigate } from 'react-router-dom'
import UpgradeDialog from '../components/billing/UpgradeDialog'

export default function UpgradePage() {
  const navigate = useNavigate()
  return <UpgradeDialog page onClose={() => navigate('/command')} />
}
