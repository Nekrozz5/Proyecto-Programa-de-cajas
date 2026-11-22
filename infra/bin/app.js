#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { NetworkStack } = require('../lib/network-stack');
const { DatabaseStack } = require('../lib/database-stack');

const app = new cdk.App();
const region = process.env.CDK_DEFAULT_REGION || app.node.tryGetContext('region') || 'us-east-2';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const env = account ? { account, region } : { region };

const network = new NetworkStack(app, 'ProgramaCajasNetworkDev', { env });
new DatabaseStack(app, 'ProgramaCajasDatabaseDev', {
    env,
    vpc: network.vpc,
    databaseSecurityGroup: network.databaseSecurityGroup
});

app.synth();
