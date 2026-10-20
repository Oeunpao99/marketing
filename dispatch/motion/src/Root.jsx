import { Composition } from 'remotion'
import { MotionPost, FPS, TRANSITION, sceneFrames } from './MotionPost'
import { Tutorial, tutorialLength } from './tutorial'
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
  </>
)
