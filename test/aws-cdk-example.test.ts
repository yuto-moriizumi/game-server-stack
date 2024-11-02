import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { GameServerStack } from "../lib";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
} from "aws-cdk-lib/aws-ec2";

test("VPC and EC2 instance created", () => {
  const app = new cdk.App();

  const stack = new GameServerStack(app, "MyTestStack", {
    appId: 123,
    execCommand: () => "Server.sh",
    instanceType: InstanceType.of(InstanceClass.T3A, InstanceSize.LARGE),
    ports: [Port.udp(7777)],
  });

  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::EC2::VPC", 1);
  template.resourceCountIs("AWS::EC2::Subnet", 1);
  template.resourceCountIs("AWS::EC2::RouteTable", 1);
  template.resourceCountIs("AWS::EC2::Instance", 1);
  template.resourceCountIs("AWS::EC2::LaunchTemplate", 1);
  template.resourceCountIs("AWS::EC2::SecurityGroup", 1);
  template.resourceCountIs("AWS::EC2::Volume", 1);
  template.resourceCountIs("AWS::EC2::InternetGateway", 1);
  template.resourceCountIs("AWS::EC2::VPCGatewayAttachment", 1);
  template.resourceCountIs("AWS::IAM::Role", 1);
});
