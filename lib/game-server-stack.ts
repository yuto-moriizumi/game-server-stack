import { Stack, StackProps } from "aws-cdk-lib";
import { CfnLifecyclePolicy } from "aws-cdk-lib/aws-dlm";
import {
  Instance,
  InstanceType,
  LaunchTemplate,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  UserData,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

const GAME_NAME = "Palworld";
const APP_ID = 2394010;
const EXECUTABLE = "PalServer.sh";
const PORT: Port[] = [Port.udp(8211)];
const INSTANCE_TYPE = "t3a.large";
const VOLUME_SIZE = 32;

const service = `[Unit]
Description=Game server
After=network.target

[Service]
Type=simple
ExecStart=/home/ec2-user/${GAME_NAME}/${EXECUTABLE}
Restart=always
User=ec2-user

[Install]
WantedBy=default.target`.replace("\n", "\\n");

export class GameServerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "VPC", {
      maxAzs: 1,
      subnetConfiguration: [
        {
          name: "Subnet",
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    const securityGroup = new SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));
    PORT.forEach((port) => securityGroup.addIngressRule(Peer.anyIpv4(), port));

    const launchTemplate = new LaunchTemplate(this, "Template", {
      spotOptions: {},
    });

    const userData = UserData.forLinux();
    userData.addCommands(
      "yum update -y",
      "yum install -y glibc.i686 libstdc++48.i686",
      "cd /home/ec2-user",
      "wget 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'",
      "tar -xzvf steamcmd_linux.tar.gz",
      "rm -f steamcmd_linux.tar.gz",
      "find -exec chmod 777 {} \\;",
      `./steamcmd.sh +force_install_dir ${GAME_NAME} +login anonymous +app_update ${APP_ID} validate +quit`,
      `echo -e "${service}" > /etc/systemd/system/game.service`,
      "systemctl daemon-reload",
      "systemctl start game",
    );
    const instance = new Instance(this, "EC2", {
      vpc,
      instanceType: new InstanceType(INSTANCE_TYPE),
      machineImage: MachineImage.latestAmazonLinux2(),
      securityGroup,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: {
            ebsDevice: {
              volumeSize: VOLUME_SIZE,
            },
          },
        },
      ],
      userData,
    });
    instance.instance.launchTemplate = {
      version: launchTemplate.versionNumber,
      launchTemplateId: launchTemplate.launchTemplateId,
    };

    new CfnLifecyclePolicy(this, "LifecyclePolicy", {
      description: "Backup Game Server",
      state: "ENABLED",
      executionRoleArn:
        "arn:aws:iam::286748709931:role/service-role/AWSDataLifecycleManagerDefaultRole",
      policyDetails: {
        policyType: "IMAGE_MANAGEMENT",
        resourceTypes: ["INSTANCE"],
        targetTags: instance.instance.tags.renderedTags,
        schedules: [
          {
            name: "Backup",
            createRule: {
              interval: 1,
              intervalUnit: "HOURS",
              times: ["09:00"],
            },
            retainRule: {
              interval: 2,
              intervalUnit: "DAYS",
            },
          },
        ],
      },
    });
  }
}
