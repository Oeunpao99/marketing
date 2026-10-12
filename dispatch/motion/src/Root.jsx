import { Composition } from 'remotion'
import { MotionPost, FPS, TRANSITION, sceneFrames } from './MotionPost'
import sample from '../sample.json'

/** One composition: a vertical motion post. Its length comes from the
 * script (each scene's seconds, minus the overlap of the transitions). */
export const Root = () => (
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
      return { durationInFrames: total - TRANSITION * (props.scenes.length - 1) }
    }}
  />
)
