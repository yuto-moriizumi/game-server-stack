import { Size, Stack, StackProps, Tag } from "aws-cdk-lib";
import { CfnLifecyclePolicy } from "aws-cdk-lib/aws-dlm";
import {
  EbsDeviceVolumeType,
  Instance,
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

const INSTALL_DIR = "game";
const DEVICE_NAME = "/dev/sdh";
const DEFAULT_SIZE = Size.gibibytes(32);

export interface GameServerStackProps extends StackProps {
  /**
   * The relative path of the game server executable from the install root folder.
   * @example "PalServer.sh" // for Palworld
   */
  executablePath: string;
  /**
   * The launch options of the game server
   * @example "-multihome=0.0.0.0"
   * @example "-multihome=0.0.0.0 -log"
   */
  launchOptions?: string;
  /**
   * The Steam app id of the game server
   * @example 2394010 // for Palworld
   */
  appId: number;
  /**
   * The ports that the game server will expose
   * @example [Port.udp(8211)] // for Palworld
   */
  ports: Port[];
  /**
   * The instance type of the game server
   * @example InstanceType.of(InstanceClass.T3A, InstanceSize.LARGE)
   */
  instanceType: InstanceType;
  /**
   * By specifying true, use spot instances
   * @default false
   */
  useSpot?: boolean;
  /**
   * The volume size of the game server
   * @default Size.gibibytes(32)
   */
  volumeSize?: Size;
  volumeId?: string;
}

export class GameServerStack extends Stack {
  private readonly volumeSize: Size;
  constructor(scope: Construct, id: string, props: GameServerStackProps) {
    super(scope, id, props);
    this.volumeSize = props.volumeSize ?? DEFAULT_SIZE;

    const service = `[Unit]
Description=Game server
After=network.target

[Service]
Type=simple
ExecStart=/data/${INSTALL_DIR}/${props.executablePath} ${props.launchOptions ?? ""}
Restart=always
User=ec2-user

[Install]
WantedBy=default.target`.replace("\n", "\\n");

    const vpc = new Vpc(this, "VPC", {
      maxAzs: 1,
      subnetConfiguration: [{ name: "Subnet", subnetType: SubnetType.PUBLIC }],
    });

    const securityGroup = new SecurityGroup(this, "SecurityGroup", {
      vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));
    props.ports.forEach((port) =>
      securityGroup.addIngressRule(Peer.anyIpv4(), port)
    );

    const launchTemplate = new LaunchTemplate(this, "Template", {
      spotOptions: props.useSpot ? {} : undefined,
    });

    const userData = UserData.forLinux();
    userData.addCommands(
      "mkdir /data",
      `mkfs -t xfs ${DEVICE_NAME}`,
      `mount ${DEVICE_NAME} /data`,
      "yum update -y",
      "yum install -y glibc.i686 libstdc++48.i686 htop",
      "cd /data",
      "wget 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'",
      "tar -xzvf steamcmd_linux.tar.gz",
      "rm -f steamcmd_linux.tar.gz",
      "find -exec chmod 777 {} \\;",
      `./steamcmd.sh +force_install_dir ${INSTALL_DIR} +login anonymous +app_update ${props.appId} validate +quit`,
      `chown -R ec2-user:ec2-user /data/${INSTALL_DIR}`,
      `echo -e "${service}" > /etc/systemd/system/game.service`,
      "systemctl daemon-reload",
      "systemctl start game"
    );

    const { instance } = new Instance(this, "EC2", {
      vpc,
      instanceType: props.instanceType,
      machineImage: MachineImage.latestAmazonLinux2(),
      securityGroup,
      userData,
    });

    const { volumeId } = this.getVolume(props.volumeId);
    instance.volumes = [{ device: DEVICE_NAME, volumeId }];
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
      description: `EBSSnapshotManagement for the ${this.stackName}`,
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

  /**
   * Creates a new volume if `importVolumeId` is not specified
   *
   * Or imports an existing volume from the specified ID
   * @param importVolumeId The ID of an existing volume
   */
  private getVolume(importVolumeId?: string) {
    if (importVolumeId)
      return Volume.fromVolumeAttributes(this, "Volume", {
        volumeId: importVolumeId,
        availabilityZone: this.availabilityZones[0],
      });
    else
      return new Volume(this, "Volume", {
        volumeName: `${this.stackName}/Volume`,
        availabilityZone: this.availabilityZones[0],
        size: this.volumeSize,
        volumeType: EbsDeviceVolumeType.GP2,
      });
  }
}
