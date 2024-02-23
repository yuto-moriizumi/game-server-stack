#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { GameServerStack } from "../lib/game-server-stack";

const app = new cdk.App();
new GameServerStack(app, "GameServerStack");
