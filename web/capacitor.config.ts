import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // личная сборка: ресурсы игры принадлежат SmallGames, в магазины не выкладываем
  appId: "local.irisfarm.port",
  appName: "Ферма Айрис",
  webDir: "dist",
  android: {
    backgroundColor: "#10140c",
  },
};

export default config;
