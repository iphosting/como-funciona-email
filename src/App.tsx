// A página interativa: modo livre (o visitante envia e-mails, faz o papel do golpista, publica SPF, DKIM e
// DMARC, enche a caixa, derruba o servidor, abre mensagens) e visita guiada (as mesmas onze cenas do vídeo,
// com a narração).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fileirasDaMsg, tituloDaMsg, type Fileira } from "./campos";
import { carregarFontes } from "./fontes";
import { Hud } from "./Hud";
import { adulterar, avaliar, criarSim, definirCaixaCheia, definirDmarc, definirNoAr, emFraude, enviar, enviarFalso, passo, protegido, publicar, type Msg, type Politica, type Resultado, type Sim } from "./sim/sim";
import { Cena3D, type Camera, type Dissec } from "./three/Cena3D";
import { PALCO } from "./three/geo";
import { ANTES, CENAS, DEPOIS, DESLOC, legenda, visao } from "./tour";

type Modo = "inicio" | "livre" | "visita";
type V3 = [number, number, number];

const PALCO_CAM: Camera = { pos: [0, PALCO.y + 0.4, 17.5], alvo: [0, PALCO.y + 0.4, 0] };
// em tela larga a ficha da mensagem ocupa a direita: o palco fica à esquerda
const PALCO_CAM_LARGA: Camera = { pos: [3.8, PALCO.y + 0.4, 22], alvo: [3.8, PALCO.y + 0.4, 0] };
const suave = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const PROXIMA: Record<Politica, Politica> = { ausente: "none", none: "quarantine", quarantine: "reject", reject: "ausente" };
const NOME_POLITICA: Record<Politica, string> = { ausente: "não publicado", none: "none (só observa)", quarantine: "quarantine (spam)", reject: "reject (recusa)" };

const temWebGL = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

const useTela = () => {
  const [t, setT] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const f = () => setT({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return t;
};

const explicacao = (m: Msg, r: Resultado) => {
  if (m.tipo === "devolucao")
    return `Esta mensagem não foi escrita por uma pessoa: foi o servidor de envio que a escreveu para avisar a Ana de que não conseguiu entregar. O motivo vem escrito nela: ${m.motivo}${m.codigo ? " (código " + m.codigo + ")" : ""}. Código que começa com 5 é erro definitivo; com 4, temporário.`;
  if (m.falsa)
    return `O golpista escreveu o endereço da Ana no campo De, que é o que o Bruno vê. Mas repare no envelope e no IP: são dele. ${r.explicacao}. Publique SPF, DKIM e DMARC e envie de novo para ver a diferença.`;
  return `Repare nas duas partes: o envelope, que os servidores usam para entregar, e o cabeçalho, que é o que aparece para o Bruno. ${r.explicacao}.`;
};

export const App: React.FC = () => {
  const tela = useTela();
  const movel = tela.w < 860;
  const aspecto = tela.w / tela.h;
  const baixa = useMemo(() => movel || (navigator.hardwareConcurrency ?? 8) <= 4, [movel]);
  const webgl = useMemo(temWebGL, []);

  const [pronto, setPronto] = useState(false);
  const [modo, setModo] = useState<Modo>("inicio");
  const [pausado, setPausado] = useState(false);
  const [vel, setVel] = useState(1);
  const [painel, setPainel] = useState(false);
  const [cena, setCena] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [, setTique] = useState(0);

  const sim = useRef<Sim>(criarSim());
  const relogio = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const fimEm = useRef(0);
  const camObj = useRef<THREE.Camera | null>(null);
  const orbita = useRef<OrbitControls | null>(null);
  const aberto = useRef<{ m: Msg; r: Resultado; fileiras: Fileira[]; em: number; fechaEm: number; de: Camera } | null>(null);
  // só para redesenhar quando uma mensagem abre ou fecha
  const [, setTemAberto] = useState(false);
  const ui = useRef({ modo, pausado, vel, cena });
  ui.current = { modo, pausado, vel, cena };

  useEffect(() => {
    carregarFontes().then(() => setPronto(true));
  }, []);

  // ----- visita guiada -----
  const tocarCena = useCallback((i: number) => {
    const a = audio.current;
    if (!a) return;
    setCena(i);
    fimEm.current = 0;
    a.src = `audio/${CENAS[i].id}.mp3`;
    a.currentTime = 0;
    a.play().then(
      () => setTocando(true),
      () => setTocando(false),
    );
  }, []);

  const iniciarVisita = useCallback(
    (i = 0) => {
      aberto.current = null;
      setTemAberto(false);
      setModo("visita");
      tocarCena(i);
    },
    [tocarCena],
  );

  const irLivre = useCallback(() => {
    audio.current?.pause();
    setTocando(false);
    // a cena não começa parada: a Ana já manda a primeira mensagem
    if (sim.current.t === 0 && sim.current.msgs.length === 0) enviar(sim.current);
    setModo("livre");
  }, []);

  // ----- laço de animação -----
  useEffect(() => {
    let raf = 0;
    let ant = performance.now();
    const quadro = (agora: number) => {
      // até 0,25 s por quadro: em aparelho lento a simulação continua no tempo certo (em passos de 1/60 s)
      const dt = Math.min(0.25, (agora - ant) / 1000);
      ant = agora;
      relogio.current += dt;
      const u = ui.current;
      if (u.modo === "livre" && !u.pausado && !aberto.current) {
        let resto = dt * u.vel;
        while (resto > 1e-6) {
          const p = Math.min(1 / 60, resto);
          passo(sim.current, p);
          resto -= p;
        }
      }
      if (u.modo === "visita") {
        const a = audio.current;
        if (a && a.ended) {
          if (!fimEm.current) fimEm.current = relogio.current;
          else if (relogio.current - fimEm.current > DEPOIS + 0.3) {
            fimEm.current = 0;
            if (u.cena < CENAS.length - 1) tocarCena(u.cena + 1);
            else irLivre();
          }
        }
      }
      const ab = aberto.current;
      if (ab && ab.fechaEm && relogio.current - ab.fechaEm > 0.7) {
        aberto.current = null;
        setTemAberto(false);
      }
      setTique((n) => (n + 1) % 1000000);
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [tocarCena, irLivre]);

  // ----- ações do modo livre -----
  const s = sim.current;
  const reiniciar = () => {
    sim.current = criarSim();
    aberto.current = null;
    setTemAberto(false);
    setPausado(false);
  };
  const abrir = useCallback((m: Msg) => {
    if (ui.current.modo !== "livre" || aberto.current) return;
    const cam = camObj.current;
    const alvo = orbita.current?.target;
    const de: Camera = cam && alvo ? { pos: [cam.position.x, cam.position.y, cam.position.z], alvo: [alvo.x, alvo.y, alvo.z] } : { pos: [3.4, 10, 26], alvo: [3.4, 0.6, 1.5] };
    const r = m.resultado ?? avaliar(sim.current, m);
    aberto.current = { m: { ...m }, r, fileiras: fileirasDaMsg(m, r), em: relogio.current, fechaEm: 0, de };
    setTemAberto(true);
  }, []);
  const abrirUma = () => {
    const cartas = () => s.msgs.filter((x) => x.tipo === "email" || x.tipo === "devolucao");
    let m = cartas().find((x) => x.falsa) ?? cartas()[0];
    if (!m) m = enviar(s);
    abrir(m);
  };
  const aoClicarMsg = useCallback(
    (id: number) => {
      const m = sim.current.msgs.find((x) => x.id === id);
      if (m) abrir(m);
    },
    [abrir],
  );
  const fechar = () => {
    if (aberto.current && !aberto.current.fechaEm) aberto.current.fechaEm = relogio.current;
  };

  // ----- o que desenhar agora -----
  let simAtual = s;
  let cam: Camera | undefined;
  let dissec: Dissec | undefined;
  let semGolpista = false;
  let hud: React.ComponentProps<typeof Hud> = { sim: s };

  if (modo === "visita") {
    const info = CENAS[cena];
    const a = audio.current;
    const t = a && (tocando || a.currentTime > 0) ? Math.min(info.total, ANTES + a.currentTime + (a.ended ? relogio.current - (fimEm.current || relogio.current) : 0)) : 0;
    const v = visao(info.id, t, movel ? 0 : DESLOC);
    simAtual = v.sim;
    cam = v.cam;
    dissec = v.dissec;
    semGolpista = !!v.semGolpista;
    hud = {
      sim: v.sim,
      numero: `${String(cena + 1).padStart(2, "0")} / ${CENAS.length} · visita guiada`,
      titulo: info.titulo,
      sub: info.sub,
      fala: legenda(info.id, t),
      destaque: v.destaque,
      cartao: v.cartao,
      limpo: (v.dissec?.e ?? 0) > 0.3,
    };
  } else {
    const ab = aberto.current;
    if (ab) {
      const e = ab.fechaEm ? 1 - suave((relogio.current - ab.fechaEm) / 0.6) : suave((relogio.current - ab.em) / 1.1);
      dissec = { titulo: tituloDaMsg(ab.m), fileiras: ab.fileiras, e, hl: -1 };
      const palco = movel ? PALCO_CAM : PALCO_CAM_LARGA;
      cam = { pos: mix(ab.de.pos, palco.pos, suave(e)), alvo: mix(ab.de.alvo, palco.alvo, suave(e)) };
      hud = { sim: s, limpo: e > 0.3 };
    }
  }

  const fraude = emFraude(simAtual);
  const livre = modo === "livre";
  const ab = aberto.current;

  if (!webgl)
    return (
      <div className="sem3d">
        <h1>Como funciona o e-mail, em 3D</h1>
        <p>Este navegador não tem o recurso gráfico (WebGL) que a cena interativa precisa. Veja o vídeo com a mesma explicação:</p>
        <video controls playsInline src="video/como-funciona-email-celular.mp4" />
      </div>
    );

  return (
    <div className={"app" + (movel ? " movel" : "") + (painel ? " painel-aberto" : "") + (fraude ? " tempestade" : "")}>
      {pronto && (
        <Canvas
          dpr={baixa ? 1 : Math.min(2, window.devicePixelRatio || 1)}
          camera={{ fov: 40, near: 0.1, far: 220, position: aspecto > 1.3 ? [3.4, 10, 26] : [0.6, (30 / aspecto) * 0.5, (30 / aspecto) * 0.86] }}
          gl={{ antialias: !baixa, powerPreference: "high-performance" }}
          onCreated={({ camera }) => {
            camObj.current = camera;
          }}
        >
          <Cena3D
            sim={simAtual}
            tempo={relogio.current}
            cam={cam}
            dissec={dissec}
            semGolpista={semGolpista}
            baixa={baixa}
            aspecto={aspecto}
            aoClicarMsg={livre ? aoClicarMsg : undefined}
            registrar={(c) => {
              orbita.current = c;
            }}
          />
        </Canvas>
      )}

      <div className="hud-web">
        <Hud {...hud} />
      </div>

      <audio ref={audio} preload="none" onPause={() => setTocando(false)} onPlay={() => setTocando(true)} />

      {livre && !ab && (
        <div className="topo">
          <b>
            Como funciona o e-mail <span>em 3D</span>
          </b>
          <small className={protegido(s) ? "bom" : ""}>{protegido(s) ? "Domínio protegido: SPF, DKIM e DMARC em reject" : fraude ? "Mensagem falsa na caixa de entrada do Bruno" : "Domínio da Ana sem as três proteções"}</small>
          <em>
            {movel
              ? aspecto < 1
                ? "Vire o celular de lado para ver maior. Toque num envelope em voo para abrir a mensagem."
                : "Toque num envelope em voo para abrir a mensagem."
              : "Arraste para girar, role para aproximar e clique num envelope em voo para abrir a mensagem."}
          </em>
        </div>
      )}

      {livre && ab && (
        <div className="ficha">
          <h2>{tituloDaMsg(ab.m)}</h2>
          <p>{explicacao(ab.m, ab.r)}</p>
          {ab.fileiras.map((f) => (
            <React.Fragment key={f.titulo}>
              <h3>{f.titulo}</h3>
              <dl>
                {f.campos.map((c) => (
                  <React.Fragment key={c.nome}>
                    <dt style={{ borderColor: c.cor }}>{c.nome}</dt>
                    <dd>
                      <b>{c.valor}</b> {c.nota && <span>{c.nota}</span>}
                    </dd>
                  </React.Fragment>
                ))}
              </dl>
            </React.Fragment>
          ))}
          <button className="principal" onClick={fechar}>
            Fechar a mensagem e voltar
          </button>
        </div>
      )}

      {livre && !ab && (
        <div className="controles">
          <button className="principal" onClick={() => enviar(s)}>
            Ana envia um e-mail
          </button>
          <button className="perigo" onClick={() => enviarFalso(s, "simples")}>
            Golpista finge ser a Ana
          </button>
          <button className="perigo" onClick={() => enviarFalso(s, "esperto")}>
            Golpista esperto (envelope próprio)
          </button>
          <button className={s.dns.spf ? "ok ativo" : "ok"} onClick={() => publicar(s, "spf", !s.dns.spf)}>
            SPF: {s.dns.spf ? "publicado" : "não publicado"}
          </button>
          <button className={s.dns.dkim ? "ok ativo" : "ok"} onClick={() => publicar(s, "dkim", !s.dns.dkim)}>
            DKIM: {s.dns.dkim ? "publicado" : "não publicado"}
          </button>
          <button className={s.dns.dmarc !== "ausente" ? "ok ativo" : "ok"} onClick={() => definirDmarc(s, PROXIMA[s.dns.dmarc])}>
            DMARC: {NOME_POLITICA[s.dns.dmarc]}
          </button>
          <button onClick={() => enviar(s, { para: "brunno@empresa.example", assunto: "Endereço digitado errado" })}>Enviar para endereço errado</button>
          <button className={s.destino.cheia ? "perigo ativo" : ""} onClick={() => definirCaixaCheia(s, !s.destino.cheia)}>
            Caixa do Bruno: {s.destino.cheia ? "cheia" : "com espaço"}
          </button>
          <button className={!s.destino.noAr ? "perigo ativo" : ""} onClick={() => definirNoAr(s, !s.destino.noAr)}>
            Servidor do Bruno: {s.destino.noAr ? "no ar" : "fora do ar"}
          </button>
          <button onClick={() => adulterar(s)} title="Altera uma mensagem assinada que esteja entre os dois servidores">
            Alterar mensagem no caminho
          </button>
          <button onClick={abrirUma}>Abrir uma mensagem</button>
          <button onClick={() => setPausado(!pausado)}>{pausado ? "Continuar" : "Pausar"}</button>
          <button onClick={() => setVel(vel === 1 ? 0.5 : vel === 0.5 ? 0.25 : vel === 0.25 ? 2 : 1)}>Velocidade: {String(vel).replace(".", ",")}x</button>
          <button onClick={reiniciar}>Reiniciar</button>
          {movel && <button onClick={() => setPainel(!painel)}>{painel ? "Esconder painel" : "Mostrar painel"}</button>}
          <button className="principal" onClick={() => iniciarVisita(0)}>
            Visita guiada
          </button>
        </div>
      )}

      {modo === "visita" && (
        <div className="controles visita">
          <button disabled={cena === 0} onClick={() => tocarCena(cena - 1)}>
            Anterior
          </button>
          <button
            className="principal"
            onClick={() => {
              const a = audio.current;
              if (!a) return;
              if (a.paused && !a.ended) a.play();
              else if (a.ended) tocarCena(cena);
              else a.pause();
            }}
          >
            {tocando ? "Pausar" : "Tocar"}
          </button>
          <button disabled={cena === CENAS.length - 1} onClick={() => tocarCena(cena + 1)}>
            Próxima
          </button>
          <span className="passos">
            {CENAS.map((c, i) => (
              <i key={c.id} className={i === cena ? "atual" : i < cena ? "feito" : ""} onClick={() => tocarCena(i)} title={c.titulo} />
            ))}
          </span>
          <button onClick={irLivre}>Explorar livre</button>
        </div>
      )}

      {modo === "inicio" && (
        <div className="inicio">
          <div className="cartaz">
            <small>ipHosting apresenta</small>
            <h1>
              Como funciona o e-mail <span>em 3D</span>
            </h1>
            <p>
              Acompanhe uma mensagem da Ana até o Bruno: o servidor de envio, a consulta ao DNS, a conversa entre os servidores e a conferência na chegada. Depois faça o
              papel do golpista, publique SPF, DKIM e DMARC e veja por que um e-mail volta.
            </p>
            <div className="botoes">
              <button className="principal" onClick={() => iniciarVisita(0)}>
                Visita guiada, com narração
              </button>
              <button onClick={irLivre}>Explorar livre</button>
            </div>
            <a href="video/como-funciona-email-celular.mp4">Prefere só assistir? Veja o vídeo (5 min)</a>
            {movel && aspecto < 1 && <em>No celular, a cena fica maior com o aparelho de lado.</em>}
          </div>
        </div>
      )}
    </div>
  );
};
