import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as AwsCdkExample from "../lib/game-server-stack";

test("SQS Queue and SNS Topic Created", () => {
  const app = new cdk.App();

  const stack = new AwsCdkExample.GameServerStack(app, "MyTestStack");

  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::SQS::Queue", {
    VisibilityTimeout: 300,
  });
  template.resourceCountIs("AWS::SNS::Topic", 1);
});
