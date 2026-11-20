#!/usr/bin/env python3
"""Gera a narração de "Como funciona o e-mail" em 3D na voz do Rodrigo (ElevenLabs), uma faixa por cena.

Pedido do Rodrigo em 20/11/2026: "usando a skill video3d com o fable 5.2 cria uma explicação detalhada de como
funciona um email...". Sobre a voz ele respondeu: "usa o token da conta rodrigo@iphosting.com.br que esta
liberado". Por isso a conta e a voz aqui são as dessa conta (voz clonada "Rodrigo Soares",
voice_id PC8CPd4ONRtNnYABsxPe), e não as da conta soares.iphosting usadas no modelo switch-loop-3d.
Modelo eleven_v4, SEM voice_settings. A chave é lida do cofre na hora e nunca impressa. No roteiro.json,
"fala" traz as siglas como se pronunciam e os números por extenso.

Cena que já tem MP3 em public/audio/ não é refeita (para refazer, apague o arquivo). Cada geração anota em
public/audio/creditos.json o custo que a API devolve no cabeçalho character-cost.

  python3 gerar_voz.py            gera o que falta
  python3 gerar_voz.py abertura   gera só essas cenas (se faltarem)
"""
import importlib.util
import json
import pathlib
import sys
import urllib.error
import urllib.request

BASE = pathlib.Path(__file__).resolve().parent
SAIDA = BASE / "public" / "audio"
COFRE = "ElevenLabs API (conta rodrigo@iphosting.com.br, voz clonada antiga PC8CPd4ONRtNnYABsxPe) - chave dada em 01/10/2026"
VOZ = "PC8CPd4ONRtNnYABsxPe"
MODELO = "eleven_v4"


def chave():
    # o leitor do wr-cofre.py espera e repete diante do 429 do cofre (o do voz-eleven.py não)
    spec = importlib.util.spec_from_file_location("wr_cofre", "/home/iphosting/projects/cloudflare/wr-cofre.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.credencial_do_cofre(COFRE)[0]


def falar(k, texto):
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=mp3_44100_128" % VOZ,
        data=json.dumps({"text": texto, "model_id": MODELO}).encode(),
        headers={"xi-api-key": k, "Content-Type": "application/json", "Accept": "audio/mpeg"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read(), r.headers.get("character-cost")


def main():
    cenas = json.loads((BASE / "roteiro.json").read_text(encoding="utf-8"))["cenas"]
    pedidas = set(sys.argv[1:])
    SAIDA.mkdir(parents=True, exist_ok=True)
    reg_arq = SAIDA / "creditos.json"
    reg = json.loads(reg_arq.read_text()) if reg_arq.exists() else {}
    k = None
    for c in cenas:
        if pedidas and c["id"] not in pedidas:
            continue
        destino = SAIDA / (c["id"] + ".mp3")
        if destino.exists():
            print("%-14s já existe" % c["id"])
            continue
        k = k or chave()
        try:
            audio, custo = falar(k, c["fala"])
        except urllib.error.HTTPError as e:
            print("%-14s ERRO HTTP %d: %s" % (c["id"], e.code, e.read().decode("utf-8", "replace")[:200]))
            return 1
        destino.write_bytes(audio)
        reg[c["id"]] = {"caracteres": len(c["fala"]), "creditos": custo, "bytes": len(audio)}
        reg_arq.write_text(json.dumps(reg, indent=1, ensure_ascii=False))
        print("%-14s ok, %d bytes, %s créditos" % (c["id"], len(audio), custo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
