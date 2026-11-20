import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// A cena é WebGL: sem placa de vídeo no servidor, o Chrome desenha por software.
Config.setChromiumOpenGlRenderer("angle");
