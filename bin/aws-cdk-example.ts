#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { GameServerStack } from "../lib/aws-cdk-example-stack";

const app = new cdk.App();
new GameServerStack(app, "GameServerStack");
