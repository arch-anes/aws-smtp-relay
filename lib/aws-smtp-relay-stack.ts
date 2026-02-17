import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as actions from 'aws-cdk-lib/aws-ses-actions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface AwsSmtpRelayStackProps extends cdk.StackProps {
  domainName: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser?: string;
  smtpPassword?: string;
  recipients?: string[];
  retryDelaySeconds?: number;
  maxRetries?: number;
}

export class AwsSmtpRelayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AwsSmtpRelayStackProps) {
    super(scope, id, props);

    const domainSafe = props.domainName.replace(/[^a-zA-Z0-9]/g, '-');

    // S3 bucket for storing incoming emails
    const emailBucket = new s3.Bucket(this, 'EmailBucket', {
      bucketName: `email-relay-${domainSafe}-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{
        expiration: cdk.Duration.days(30)
      }]
    });

    // Lambda function to forward emails
    const forwarderFunction = new lambda.Function(this, 'EmailForwarder', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/dist'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        DOMAIN_NAME: props.domainName,
        BUCKET_NAME: emailBucket.bucketName,
        SMTP_HOST: props.smtpHost,
        SMTP_PORT: props.smtpPort,
        SMTP_USER: props.smtpUser || '',
        SMTP_PASSWORD: props.smtpPassword || ''
      }
    });

    emailBucket.grantRead(forwarderFunction);

    // DLQ for failed emails
    const dlq = new sqs.Queue(this, 'FailedEmailsDLQ', {
      queueName: `email-relay-dlq-${domainSafe}`,
      retentionPeriod: cdk.Duration.days(14)
    });

    // Queue for email processing with retry
    const emailQueue = new sqs.Queue(this, 'EmailQueue', {
      queueName: `email-relay-${domainSafe}`,
      visibilityTimeout: cdk.Duration.seconds(props.retryDelaySeconds || 90),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: props.maxRetries || 3
      }
    });

    forwarderFunction.addEventSource(new lambdaEventSources.SqsEventSource(emailQueue));

    // SES receipt rule set
    const ruleSet = new ses.ReceiptRuleSet(this, 'RuleSet', {
      receiptRuleSetName: 'email-forwarding-rules'
    });

    // SNS topic for SES notifications
    const emailTopic = new cdk.aws_sns.Topic(this, 'EmailTopic', {
      topicName: `email-relay-${domainSafe}`
    });

    emailTopic.addSubscription(new cdk.aws_sns_subscriptions.SqsSubscription(emailQueue));

    // SES receipt rule
    ruleSet.addRule('ForwardRule', {
      enabled: true,
      recipients: props.recipients || [props.domainName],
      scanEnabled: true,
      actions: [
        new actions.S3({
          bucket: emailBucket,
          objectKeyPrefix: 'emails/',
          topic: emailTopic
        })
      ]
    });

    new cdk.CfnOutput(this, 'EmailBucketName', {
      value: emailBucket.bucketName
    });
  }
}
