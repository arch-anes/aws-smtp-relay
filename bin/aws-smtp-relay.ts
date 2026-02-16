#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsSmtpRelayStack } from '../lib/aws-smtp-relay-stack';

const app = new cdk.App();

const domainName = app.node.tryGetContext('domainName') || 'example.com';
const smtpHost = app.node.tryGetContext('smtpHost') || 'smtp.example.com';
const smtpPort = app.node.tryGetContext('smtpPort') || '25';
const smtpUser = app.node.tryGetContext('smtpUser');
const smtpPassword = app.node.tryGetContext('smtpPassword');
const recipients = app.node.tryGetContext('recipients')?.split(',');
const retryDelaySeconds = app.node.tryGetContext('retryDelaySeconds');
const maxRetries = app.node.tryGetContext('maxRetries');

const stackName = `AwsSmtpRelay-${domainName.replace(/[^a-zA-Z0-9]/g, '-')}`;

new AwsSmtpRelayStack(app, stackName, {
  domainName,
  smtpHost,
  smtpPort,
  smtpUser,
  smtpPassword,
  recipients,
  retryDelaySeconds,
  maxRetries,
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  }
});