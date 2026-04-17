import React from 'react'
import { Composition } from 'remotion'
import { LaunchVideo } from './LaunchVideo'

// 30 seconds at 30fps = 900 frames
// 1080p — standard LinkedIn/YouTube/Twitter Video
export const Root: React.FC = () => (
  <Composition
    id="LaunchVideo"
    component={LaunchVideo}
    durationInFrames={900}
    fps={30}
    width={1920}
    height={1080}
  />
)
