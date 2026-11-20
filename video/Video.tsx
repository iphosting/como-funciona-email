// O vídeo: a mesma cena 3D da página, desenhada quadro a quadro seguindo a visita guiada.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { ThreeCanvas } from "@remotion/three";
import "../src/estilo.css";
import { carregarFontes } from "../src/fontes";
import { Cena3D } from "../src/three/Cena3D";
import { Hud } from "../src/Hud";
import { ANTES, CENAS, legenda, visao } from "../src/tour";

export const FPS = 30;
export const quadrosDaCena = (i: number) => Math.ceil(CENAS[i].total * FPS);
export const TOTAL = CENAS.reduce((s, _, i) => s + quadrosDaCena(i), 0);

const INICIOS: number[] = [];
CENAS.reduce((ac, _, i) => {
  INICIOS[i] = ac;
  return ac + quadrosDaCena(i);
}, 0);

export const Video: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const [pronto, setPronto] = useState(false);
  const [espera] = useState(() => delayRender("fontes"));
  useEffect(() => {
    carregarFontes().then(() => {
      setPronto(true);
      continueRender(espera);
    });
  }, [espera]);

  let i = CENAS.length - 1;
  while (i > 0 && frame < INICIOS[i]) i--;
  const cena = CENAS[i];
  const t = (frame - INICIOS[i]) / FPS;
  const v = visao(cena.id, t);
  // tempo contínuo do vídeo, para os pisca-piscas não reiniciarem a cada cena
  const tempo = frame / FPS;
  const abrindo = v.dissec ? v.dissec.e : 0;

  return (
    <AbsoluteFill style={{ background: "#070b16" }}>
      {pronto && (
        <ThreeCanvas width={width} height={height} camera={{ fov: 40, near: 0.1, far: 200, position: [0, 8, 19] }} gl={{ antialias: true }}>
          <Cena3D sim={v.sim} tempo={tempo} cam={v.cam} dissec={v.dissec} semGolpista={v.semGolpista} aspecto={width / height} />
        </ThreeCanvas>
      )}
      <AbsoluteFill style={{ fontSize: 20 }}>
        <Hud
          sim={v.sim}
          numero={`${String(i + 1).padStart(2, "0")} / ${CENAS.length} · como funciona o e-mail`}
          titulo={cena.titulo}
          sub={cena.sub}
          fala={legenda(cena.id, t)}
          destaque={v.destaque}
          cartao={v.cartao}
          limpo={abrindo > 0.3}
          rodape="ipHosting · narração na voz de Rodrigo Soares, gerada por IA com autorização dele"
        />
      </AbsoluteFill>
      {CENAS.map((c, j) => (
        <Sequence key={c.id} from={INICIOS[j] + Math.round(ANTES * FPS)} durationInFrames={Math.ceil(c.dur * FPS) + 5} layout="none">
          <Audio src={staticFile(`audio/${c.id}.mp3`)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
