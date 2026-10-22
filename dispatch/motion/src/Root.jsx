import { Composition } from 'remotion'
import { MotionPost, FPS, TRANSITION, sceneFrames } from './MotionPost'
import { Tutorial, TutorialThumb, tutorialLength } from './tutorial'
import { Timeline, EDIT_FPS, EDIT_SIZES, timelineFrames } from './timeline'
import sample from '../sample.json'

/** The motion post (vertical, or wide for some templates), and the app's own
 * how-to videos (tutorial.jsx). A length comes from the script (each scene's
 * seconds, minus the overlap of the transitions). */
export const Root = () => (
  <>
  <Composition
    id="Tutorial"
    component={Tutorial}
    width={1920}
    height={1080}
    fps={FPS}
    durationInFrames={300}
    defaultProps={{ title: '', sub: '', lesson: '', intro: { seconds: 3 }, steps: [], outro: { title: '', seconds: 3 } }}
    calculateMetadata={({ props }) => ({ durationInFrames: tutorialLength(props, FPS) })}
  />
  <Composition
    id="TutorialThumb"
    component={TutorialThumb}
    width={1280}
    height={720}
    fps={FPS}
    durationInFrames={1}
    defaultProps={{ lesson: 'មេរៀនទី ១', title: 'ភ្ជាប់ទំព័ររបស់បង', sub: 'Connect your pages', n: 1, art: null }}
  />
  <Composition
    id="MotionPost"
    component={MotionPost}
    width={1080}
    height={1920}
    fps={FPS}
    durationInFrames={300}
    defaultProps={sample}
    calculateMetadata={({ props }) => {
      const total = props.scenes.reduce((n, s) => n + sceneFrames(s), 0)
      // props.ratio "16:9" = a wide 1920×1080 video (the Training template); else vertical
      const wide = props.ratio === '16:9'
      return { durationInFrames: total - TRANSITION * (props.scenes.length - 1), width: wide ? 1920 : 1080, height: wide ? 1080 : 1920 }
    }}
  />
  {/* the video editor's export (timeline.jsx; app/editor.py) */}
  <Composition
    id="Timeline"
    component={Timeline}
    width={1080}
    height={1920}
    fps={EDIT_FPS}
    durationInFrames={30}
    defaultProps={{ ratio: '9:16', tracks: [], clips: [] }}
    calculateMetadata={({ props }) => {
      const [width, height] = EDIT_SIZES[props.ratio] || EDIT_SIZES['9:16']
      return { durationInFrames: timelineFrames(props), width, height }
    }}
  />
  </>
)
