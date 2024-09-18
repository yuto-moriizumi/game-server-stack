#!/usr/bin/env node
import {
  InstanceType,
  InstanceClass,
  InstanceSize,
  Port,
} from "aws-cdk-lib/aws-ec2";
import { GameServerStack, GameServerStackProps } from "../lib";
import { App, Size } from "aws-cdk-lib";

/** List of the games confirmed to work */
const GAMES = {
  Palworld: {
    appId: 2394010,
    executablePath: "PalServer.sh",
    instanceType: InstanceType.of(InstanceClass.T3A, InstanceSize.LARGE),
    ports: [Port.udp(8211)],
    volumeSize: Size.gibibytes(32),
    useSpot: true,
  },
  Satisfactory: {
    appId: 1690800,
    executablePath: "FactoryServer.sh",
    // launchOptions: "-multihome=0.0.0.0",
    instanceType: InstanceType.of(InstanceClass.M7I_FLEX, InstanceSize.LARGE),
    ports: [Port.tcp(7777), Port.udp(7777), Port.udp(15000), Port.udp(15777)],
    volumeSize: Size.gibibytes(24),
    useSpot: false,
    volumeId: "vol-0713378dc970fb43d",
    /** Savedata is created under user's home */
    mountPaths: ["/home/ec2-user/.config/Epic"],
  },
} as const satisfies Record<string, GameServerStackProps>;

// App definition
const app = new App();
new GameServerStack(app, "Satisfactory2", GAMES.Satisfactory);
