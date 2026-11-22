const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');

class NetworkStack extends cdk.Stack {
    constructor(scope, id, props = {}) {
        super(scope, id, props);

        this.vpc = new ec2.Vpc(this, 'PosVpc', {
            vpcName: 'programa-cajas-dev',
            ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [
                {
                    name: 'public',
                    subnetType: ec2.SubnetType.PUBLIC,
                    cidrMask: 24
                },
                {
                    name: 'database',
                    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
                    cidrMask: 24
                }
            ]
        });

        this.applicationSecurityGroup = new ec2.SecurityGroup(this, 'ApplicationSecurityGroup', {
            vpc: this.vpc,
            securityGroupName: 'programa-cajas-dev-app',
            description: 'Permite trafico de la aplicacion hacia servicios internos.',
            allowAllOutbound: true
        });

        this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
            vpc: this.vpc,
            securityGroupName: 'programa-cajas-dev-db',
            description: 'Solo acepta PostgreSQL desde el Security Group de la aplicacion.',
            allowAllOutbound: true
        });

        this.databaseSecurityGroup.addIngressRule(
            this.applicationSecurityGroup,
            ec2.Port.tcp(5432),
            'PostgreSQL desde ECS o la aplicación autorizada'
        );

        new cdk.CfnOutput(this, 'VpcId', {
            value: this.vpc.vpcId,
            exportName: `${this.stackName}-VpcId`
        });
        new cdk.CfnOutput(this, 'DatabaseSubnetIds', {
            value: this.vpc.isolatedSubnets.map((subnet) => subnet.subnetId).join(','),
            exportName: `${this.stackName}-DatabaseSubnetIds`
        });
        new cdk.CfnOutput(this, 'ApplicationSecurityGroupId', {
            value: this.applicationSecurityGroup.securityGroupId,
            exportName: `${this.stackName}-ApplicationSecurityGroupId`
        });
        new cdk.CfnOutput(this, 'DatabaseSecurityGroupId', {
            value: this.databaseSecurityGroup.securityGroupId,
            exportName: `${this.stackName}-DatabaseSecurityGroupId`
        });
    }
}

module.exports = { NetworkStack };
