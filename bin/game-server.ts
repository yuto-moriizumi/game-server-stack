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
    launchOptions: "-multihome=0.0.0.0",
    instanceType: InstanceType.of(InstanceClass.T3A, InstanceSize.XLARGE),
    ports: [Port.udp(7777), Port.udp(15000), Port.udp(15777)],
    volumeSize: Size.gibibytes(24),
    useSpot: true,
  },
} as const satisfies Record<string, GameServerStackProps>;

// App definition
const app = new App();
new GameServerStack(app, "Satisfactory", GAMES.Satisfactory);
