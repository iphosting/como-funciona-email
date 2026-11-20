// Fonte Inter embutida no pacote (nada carregado de fora).
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";

/** Garante que a Inter está carregada antes de desenhar texto em canvas (as texturas 3D dependem disso). */
export const carregarFontes = async () => {
  try {
    await Promise.all(["500", "600", "700", "800"].map((p) => document.fonts.load(`${p} 24px Inter`, "Olá ç ã 123")));
  } catch {
    /* sem a fonte, o navegador usa a do sistema */
  }
};
