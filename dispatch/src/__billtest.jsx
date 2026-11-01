// THROWAWAY visual check of the Picture story storyboard picker (never committed).
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import StoryboardEditor from './components/studio/StoryboardEditor'

function Demo() {
  const [plan, setPlan] = useState({
    style: 'picture',
    art: 'painted',
    ink: { text: '#FFFFFF', accent: '#FFD400' },
    scenes: [
      { type: 'shot', title: 'Where did the [money] go?', say: 'Sophea’s wallet was empty again.' },
      { type: 'shot', title: 'One small [idea]', say: 'Then one small idea changed everything.' },
    ],
  })
  return <StoryboardEditor plan={plan} onChange={setPlan} onMake={() => {}} onRewrite={() => {}} voice />
}
createRoot(document.getElementById('root')).render(
  <div style={{ padding: 24, maxWidth: 780, background: '#f6f7f9' }}>
    <Demo />
  </div>,
)
