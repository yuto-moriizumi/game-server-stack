import { Size, Stack, StackProps, Tag } from "aws-cdk-lib";
import { CfnLifecyclePolicy } from "aws-cdk-lib/aws-dlm";
import {
  EbsDeviceVolumeType,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  LaunchTemplate,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  UserData,
  Volume,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Role } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

const GAME_NAME = "Palworld";
const APP_ID = 2394010;
const EXECUTABLE = "PalServer.sh";
const PORT: Port[] = [Port.udp(8211)];
// const INSTANCE_TYPE = new InstanceType("t3a.large");
const INSTANCE_TYPE = InstanceType.of(InstanceClass.T3A, InstanceSize.MEDIUM);
const VOLUME_SIZE = 17;
const DEVICE_NAME = "/dev/sdh";

const service = `[Unit]
Description=Game server
After=network.target

[Service]
Type=simple
ExecStart=/data/${GAME_NAME}/${EXECUTABLE}
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
      // spotOptions: {},
    });

    const userData = UserData.forLinux();
    userData.addCommands(
      "mkdir /data",
      `mkfs -t xfs ${DEVICE_NAME}`,
      `mount ${DEVICE_NAME} /data`,
      "yum update -y",
      "yum install -y glibc.i686 libstdc++48.i686",
      "cd /data",
      "wget 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'",
      "tar -xzvf steamcmd_linux.tar.gz",
      "rm -f steamcmd_linux.tar.gz",
      "find -exec chmod 777 {} \\;",
      `./steamcmd.sh +force_install_dir ${GAME_NAME} +login anonymous +app_update ${APP_ID} validate +quit`,
      `echo -e "${service}" > /etc/systemd/system/game.service`,
      "systemctl daemon-reload",
      "systemctl start game"
    );

    const { instance } = new Instance(this, "EC2", {
      vpc,
      instanceType: INSTANCE_TYPE,
      machineImage: MachineImage.latestAmazonLinux2(),
      securityGroup,
      userData,
    });
    const volume = new Volume(this, "Volume", {
      volumeName: "GameServerStack/Volume",
      availabilityZone: this.availabilityZones[0],
      size: Size.gibibytes(VOLUME_SIZE), // ボリュームサイズを指定
      volumeType: EbsDeviceVolumeType.GP2, // ボリュームタイプを指定
    });
    instance.volumes = [{ device: DEVICE_NAME, volumeId: volume.volumeId }];
    instance.launchTemplate = {
      version: launchTemplate.versionNumber,
      launchTemplateId: launchTemplate.launchTemplateId,
    };

    const executionRoleArn = Role.fromRoleName(
      this,
      "Role",
      "AWSDataLifecycleManagerDefaultRole"
    ).roleArn;
    new CfnLifecyclePolicy(this, "LifecyclePolicy", {
      description: "EBSSnapshotManagement for the GameServerStack",
      state: "ENABLED",
      executionRoleArn,
      policyDetails: {
        policyType: "EBS_SNAPSHOT_MANAGEMENT",
        resourceTypes: ["VOLUME"],
        targetTags: [new Tag("aws:cloudformation:stack-id", this.stackId)],
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
