const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const rds = require('aws-cdk-lib/aws-rds');

class DatabaseStack extends cdk.Stack {
    constructor(scope, id, props = {}) {
        super(scope, id, props);

        if (!props.vpc || !props.databaseSecurityGroup) {
            throw new Error('DatabaseStack requiere vpc y databaseSecurityGroup del NetworkStack.');
        }

        const postgresParameterGroup = new rds.ParameterGroup(this, 'PostgresParameters', {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_16_13
            }),
            parameters: {
                'rds.force_ssl': '1'
            }
        });
        const backupRetentionDays = Number(process.env.RDS_BACKUP_RETENTION_DAYS || 1);
        if (!Number.isInteger(backupRetentionDays) || backupRetentionDays < 1) {
            throw new Error('RDS_BACKUP_RETENTION_DAYS debe ser un entero mayor o igual a 1.');
        }

        const database = new rds.DatabaseInstance(this, 'Postgres', {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_16_13
            }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            vpc: props.vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            securityGroups: [props.databaseSecurityGroup],
            instanceIdentifier: 'programa-cajas-dev-db',
            databaseName: 'control_plane',
            credentials: rds.Credentials.fromGeneratedSecret('posadmin', {
                secretName: 'programa-cajas/dev/rds-master'
            }),
            allocatedStorage: 20,
            maxAllocatedStorage: 50,
            storageType: rds.StorageType.GP3,
            storageEncrypted: true,
            backupRetention: cdk.Duration.days(backupRetentionDays),
            deleteAutomatedBackups: false,
            deletionProtection: true,
            multiAz: false,
            publiclyAccessible: false,
            parameterGroup: postgresParameterGroup,
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
            value: 'Ejecutar scripts/provision-rds-databases.js tras disponibilidad de RDS para crear negocio_cafeteria de forma idempotente.'
        });
        new cdk.CfnOutput(this, 'SslMode', {
            value: 'verify-full con el bundle CA de RDS; el parámetro rds.force_ssl está habilitado.'
        });
        new cdk.CfnOutput(this, 'BackupRetentionDays', {
            value: String(backupRetentionDays)
        });
    }
}

module.exports = { DatabaseStack };
