// Texto dentro da cena 3D: desenhado num canvas 2D e usado como textura (sem carregar fonte de fora).
import * as THREE from "three";

export const FONTE = "Inter, system-ui, 'Segoe UI', Roboto, Arial, sans-serif";
const cache = new Map<string, THREE.CanvasTexture>();

export const textura = (chave: string, w: number, h: number, desenhar: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
  let t = cache.get(chave);
  if (!t) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d")!;
    desenhar(c, w, h);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (cache.size > 400) {
      const k = cache.keys().next().value as string;
      cache.get(k)?.dispose();
      cache.delete(k);
    }
    cache.set(chave, t);
  }
  return t;
};

export const caixaArredondada = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

/** Escreve encolhendo a fonte até caber na largura. */
export const caber = (c: CanvasRenderingContext2D, txt: string, x: number, y: number, max: number, tam: number, peso = 700) => {
  let t = tam;
  do {
    c.font = `${peso} ${t}px ${FONTE}`;
    if (c.measureText(txt).width <= max) break;
    t -= 2;
  } while (t > 10);
  c.fillText(txt, x, y);
};

export const limparTexturas = () => {
  cache.forEach((t) => t.dispose());
  cache.clear();
};
