import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Shell({ children }) {
  return (
    <div className="min-h-screen bg-ink-50 grid lg:grid-cols-[248px_1fr]">
      <Sidebar />
      <div className="min-w-0 flex flex-col">
        <Topbar />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
