# Game Server Stack for aws-cdk

This project is a game server stack built using the AWS Cloud Development Kit (CDK). It provides an infrastructure for hosting game servers on AWS.

## Features

- Single VPC & Public subnet
- EC2 spot instance for hosting dedicated game servers
- Hourly AMI backup with Data Lifecycle Manager policy
- Automanic SteamCMD setup
- Infrastructure-as-Code using the AWS CDK for easy deployment and management

## Prerequisites

Before getting started, make sure you have the following:

- AWS account
- AWS CLI installed and configured
- Node.js and npm installed
- Basic knowledge of AWS services and the CDK framework

## Installation

1. Clone the repository: `git clone https://github.com/your-username/game-server-stack.git`
1. Install dependencies: `npm ci`

## Usage

1. Configure your AWS credentials: `aws configure`
1. Create CloudFormation: `cdk synth`
1. Deploy the stack: `cdk deploy`
1. Monitor the deployment progress in the AWS CloudFormation console

By default your EC2 instance will be created via the spot intance request just for cost optimization. If it makes you umcomfortable, pls remove `spotOptions` from the LanchTemplate within the `lib/game-server-stack.ts`

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request.

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).

## Contact

For any questions or inquiries, feel free to submit issues.
