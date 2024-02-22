#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsCdkExampleStack } from '../lib/aws-cdk-example-stack';

const app = new cdk.App();
new AwsCdkExampleStack(app, 'AwsCdkExampleStack');
