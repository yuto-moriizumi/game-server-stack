import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as AwsCdkExample from "../lib/game-server-stack";

test("VPC and EC2 instance created", () => {
  const app = new cdk.App();

  const stack = new AwsCdkExample.GameServerStack(app, "MyTestStack");

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::EC2::VPC", 1);
  template.resourceCountIs("AWS::EC2::Instance", 1);
});
