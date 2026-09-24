import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileBar from './MobileBar'
import AIAssistant from '../ai/AIAssistant'
import CreateBrandDrawer from './CreateBrandDrawer'

const KEY = 'dispatch.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export default function Shell({ children }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = () =>
    setCollapsed((v) => {
      try {
        localStorage.setItem(KEY, v ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !v
    })

  return (
    <div
      className={`min-h-screen bg-canvas grid ${
        collapsed ? 'lg:grid-cols-[minmax(0,1fr)]' : 'lg:grid-cols-[252px_minmax(0,1fr)]'
      }`}
    >
      {!collapsed && <Sidebar />}
      <div className="min-w-0 flex flex-col pb-16 lg:pb-0">
        <Topbar onToggleSidebar={toggle} />
        <main className="min-w-0 mx-auto w-full max-w-[1480px]">{children}</main>
      </div>
      <MobileBar />
      <AIAssistant />
      <CreateBrandDrawer />
    </div>
  )
}
