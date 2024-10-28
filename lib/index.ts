import { Size, Stack, StackProps, Tag } from "aws-cdk-lib";
import { CfnLifecyclePolicy } from "aws-cdk-lib/aws-dlm";
import {
  CfnEIP,
  CfnEIPAssociation,
  EbsDeviceVolumeType,
  Instance,
  InstanceType,
  LaunchTemplate,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  SpotInstanceInterruption,
  SpotRequestType,
  SubnetType,
  UserData,
  Volume,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Role } from "aws-cdk-lib/aws-iam";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import { basename } from "path";

const INSTALL_DIR = "game";
const DEVICE_NAME = "/dev/sdh";
const DEFAULT_SIZE = Size.gibibytes(32);

interface GameServerCommonProps extends StackProps {
  execCommand: (uploadedZipPath?: string) => string;
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
   * The volume size of the persistent volume
   * Note that this doesn't apply for the root volume
   * @default Size.gibibytes(32)
   */
  volumeSize?: Size;
  /**
   * Specifying `volumeId` will import an existing persistent volume instead of creating a new one
   * @example "vol-06782846ac40dcdea"
   */
  volumeId?: string;
  /**
   * The absolute paths to be stored in the persistent volume
   * Can be useful for games which has savedata under different location to game executable
   * @example ["/home/ec2-user/.config/Epic"] // for Satisfactory
   */
  mountPaths?: string[];
  /**
   * The path of the file to be uploaded to the game server
   */
  uploadZipPath?: string;
}

/** For the servers can be installed with SteamCMD */
interface SteamCMDServerProps extends GameServerCommonProps {
  /**
   * The Steam app id of the game server
   * @example 2394010 // for Palworld
   */
  appId: number;
}
/** For the servers requires custom install script */
interface CustomServerProps extends GameServerCommonProps {
  /**
   * List of commands to get the server executable
   */
  commands: string[];
}
export type GameServerProps = SteamCMDServerProps | CustomServerProps;

export class GameServerStack extends Stack {
  private readonly volumeSize: Size;
  constructor(scope: Construct, id: string, props: GameServerProps) {
    super(scope, id, props);
    this.volumeSize = props.volumeSize ?? DEFAULT_SIZE;

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
      spotOptions: props.useSpot
        ? {
            requestType: SpotRequestType.PERSISTENT,
            interruptionBehavior: SpotInstanceInterruption.STOP,
          }
        : undefined,
    });

    const userData = UserData.forLinux();
    const mountPaths = ["/data", ...(props.mountPaths ?? [])];
    userData.addCommands(
      `mkfs -t xfs ${DEVICE_NAME}`,
      ...mountPaths.map((path) => `mkdir -p ${path}`),
      ...mountPaths.map((path) => `mount ${DEVICE_NAME} ${path}`),
      "yum update -y",
      "yum install -y glibc.i686 libstdc++48.i686",
      "yum install -y htop", // sometimes the above command fails so install htop separately,
      "cd /data"
    );
    if ("appId" in props) {
      userData.addCommands(
        "wget 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz'",
        "tar -xzvf steamcmd_linux.tar.gz",
        "rm -f steamcmd_linux.tar.gz",
        "find -exec chmod 777 {} \\;",
        `./steamcmd.sh +force_install_dir ${INSTALL_DIR} +login anonymous +app_update ${props.appId} validate +quit`
      );
    } else {
      userData.addCommands(...props.commands);
    }

    const instance = new Instance(this, "EC2", {
      vpc,
      instanceType: props.instanceType,
      machineImage: MachineImage.latestAmazonLinux2023(),
      securityGroup,
      userData,
    });
    const service = this.getSystemdService(
      props.execCommand,
      props.uploadZipPath && this.createAsset(props.uploadZipPath, instance)
    );
    userData.addCommands(
      "chown -R ec2-user:ec2-user /data",
      `echo -e "${service}" > /etc/systemd/system/game.service`,
      "systemctl daemon-reload",
      "systemctl start game"
    );

    const { instance: cfnInstance, instanceId } = instance;
    const { volumeId } = this.getVolume(props.volumeId);
    cfnInstance.volumes = [{ device: DEVICE_NAME, volumeId }];
    cfnInstance.launchTemplate = {
      version: launchTemplate.versionNumber,
      launchTemplateId: launchTemplate.launchTemplateId,
    };
    if (props.useSpot)
      new CfnEIPAssociation(this, "EIPAssociation", {
        allocationId: new CfnEIP(this, "EIP").attrAllocationId,
        instanceId,
      });

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
        targetTags: [new Tag("Name", `${this.stackName}/Volume`)],
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
        volumeType: EbsDeviceVolumeType.GP3,
      });
  }

  private createAsset(path: string, instance: Instance) {
    const asset = new Asset(this, "Asset", { path });
    asset.grantRead(instance);
    const assetPath = instance.userData.addS3DownloadCommand({
      bucket: asset.bucket,
      bucketKey: asset.s3ObjectKey,
    });
    const uploadedZipPath = `/data/${basename(assetPath)}`;
    instance.userData.addCommands(`mv ${assetPath} ${uploadedZipPath}`);
    return uploadedZipPath;
  }

  private getSystemdService(
    execCommand: GameServerCommonProps["execCommand"],
    uploadedZipPath?: string
  ) {
    return `[Unit]
Description=Game server
After=network.target

[Service]
Type=simple
ExecStart=${execCommand(uploadedZipPath)}
Restart=always
User=ec2-user

[Install]
WantedBy=default.target`.replace("\n", "\\n");
  }
}
