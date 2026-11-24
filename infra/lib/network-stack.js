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
            description: 'ECS recibe trafico solo desde el ALB y accede a PostgreSQL.',
            allowAllOutbound: true
        });

        // Se conserva el recurso y output de aplicación para no romper el
        // contrato Red AWS -> RDS; este SG representa las tareas ECS.
        this.ecsSecurityGroup = this.applicationSecurityGroup;

        this.loadBalancerSecurityGroup = new ec2.SecurityGroup(this, 'LoadBalancerSecurityGroup', {
            vpc: this.vpc,
            securityGroupName: 'programa-cajas-dev-alb',
            description: 'ALB publico; reenvia solo al puerto HTTP de ECS.',
            allowAllOutbound: false
        });

        this.loadBalancerSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv4(),
            ec2.Port.tcp(443),
            'HTTPS publico al ALB'
        );
        this.loadBalancerSecurityGroup.addIngressRule(
            ec2.Peer.anyIpv6(),
            ec2.Port.tcp(443),
            'HTTPS publico al ALB'
        );

        this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
            vpc: this.vpc,
            securityGroupName: 'programa-cajas-dev-db',
            description: 'Solo acepta PostgreSQL desde el Security Group de la aplicacion.',
            allowAllOutbound: true
        });

        this.databaseSecurityGroup.addIngressRule(
            this.applicationSecurityGroup,
            ec2.Port.tcp(5432),
            'PostgreSQL desde ECS o la aplicacion autorizada'
        );

        this.applicationSecurityGroup.addIngressRule(
            this.loadBalancerSecurityGroup,
            ec2.Port.tcp(3000),
            'HTTP de la aplicacion desde el ALB'
        );

        this.loadBalancerSecurityGroup.addEgressRule(
            this.applicationSecurityGroup,
            ec2.Port.tcp(3000),
            'Reenvio del ALB hacia ECS'
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
        new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
            value: this.ecsSecurityGroup.securityGroupId,
            exportName: `${this.stackName}-EcsSecurityGroupId`
        });
        new cdk.CfnOutput(this, 'LoadBalancerSecurityGroupId', {
            value: this.loadBalancerSecurityGroup.securityGroupId,
            exportName: `${this.stackName}-LoadBalancerSecurityGroupId`
        });
        new cdk.CfnOutput(this, 'DatabaseSecurityGroupId', {
            value: this.databaseSecurityGroup.securityGroupId,
            exportName: `${this.stackName}-DatabaseSecurityGroupId`
        });
    }
}

module.exports = { NetworkStack };
