import React from "react";
import { Composition } from "remotion";
import { FPS, TOTAL, Video } from "./Video";

export const RemotionRoot: React.FC = () => (
  <Composition id="ComoFuncionaEmail" component={Video} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
);
