#!/usr/bin/env node
import {
  InstanceType,
  InstanceClass,
  InstanceSize,
  Port,
} from "aws-cdk-lib/aws-ec2";
import { GameServerStack, GameServerProps } from "../lib";
import { App, Size } from "aws-cdk-lib";
import { join } from "path";
import { cwd } from "process";

/** List of the games confirmed to work */
const GAMES = {
  Palworld: {
    appId: 2394010,
    instanceType: InstanceType.of(InstanceClass.T3A, InstanceSize.LARGE),
    ports: [Port.udp(8211)],
    volumeSize: Size.gibibytes(32),
    useSpot: true,
    execCommand: () => "/data/game/PalServer.sh",
  },
  Satisfactory: {
    appId: 1690800,
    instanceType: InstanceType.of(
      "c7i-flex" as InstanceClass,
      InstanceSize.XLARGE
    ),
    ports: [Port.tcp(7777), Port.udp(7777), Port.udp(15000), Port.udp(15777)],
    volumeSize: Size.gibibytes(24),
    useSpot: true,
    volumeId: "vol-0713378dc970fb43d",
    /** Savedata is created under user's home */
    mountPaths: ["/home/ec2-user/.config/Epic"],
    execCommand: () => "/data/game/FactoryServer.sh",
  },
  Factorio: {
    uploadZipPath: join(cwd(), "asset", "2024.11.zip"),
    instanceType: InstanceType.of(
      "c7i-flex" as InstanceClass,
      InstanceSize.LARGE
    ),
    ports: [Port.udp(34197)],
    volumeSize: Size.gibibytes(24),
    commands: [
      "wget https://factorio.com/get-download/stable/headless/linux64",
      "tar -xvf linux64 && rm -f linux64",
    ],
    execCommand: (zipPath) =>
      `/data/factorio/bin/x64/factorio --start-server ${zipPath}`,
  },
} as const satisfies Record<string, GameServerProps>;

// App definition
const app = new App();
new GameServerStack(app, "Factorio2", GAMES.Factorio);
