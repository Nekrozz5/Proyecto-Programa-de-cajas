const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const rds = require('aws-cdk-lib/aws-rds');

class DatabaseStack extends cdk.Stack {
    constructor(scope, id, props = {}) {
        super(scope, id, props);

        if (!props.vpc || !props.databaseSecurityGroup) {
            throw new Error('DatabaseStack requiere vpc y databaseSecurityGroup del NetworkStack.');
        }

        const database = new rds.DatabaseInstance(this, 'Postgres', {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_16_13
            }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [props.databaseSecurityGroup],
            databaseName: 'control_plane',
            credentials: rds.Credentials.fromGeneratedSecret('posadmin', {
                secretName: 'programa-cajas/dev/rds-master'
            }),
            allocatedStorage: 20,
            maxAllocatedStorage: 50,
            storageType: rds.StorageType.GP3,
            storageEncrypted: true,
            backupRetention: cdk.Duration.days(7),
            deleteAutomatedBackups: false,
            deletionProtection: true,
            multiAz: false,
            publiclyAccessible: false,
            autoMinorVersionUpgrade: true,
            removalPolicy: cdk.RemovalPolicy.SNAPSHOT
        });

        new cdk.CfnOutput(this, 'DatabaseEndpoint', {
            value: database.dbInstanceEndpointAddress
        });
        new cdk.CfnOutput(this, 'DatabasePort', {
            value: database.dbInstanceEndpointPort
        });
        new cdk.CfnOutput(this, 'MasterSecretArn', {
            value: database.secret.secretArn
        });
        new cdk.CfnOutput(this, 'TenantDatabaseStrategy', {
            value: 'Crear una base PostgreSQL por tenant dentro de esta instancia mediante el proceso de provisionamiento.'
        });
    }
}

module.exports = { DatabaseStack };
