import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { AwsSmtpRelayStack } from '../lib/aws-smtp-relay-stack';

describe('AwsSmtpRelayStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new AwsSmtpRelayStack(app, 'TestStack', {
      domainName: 'test.com',
      smtpHost: 'smtp.test.com',
      smtpPort: '25'
    });
    template = Template.fromStack(stack);
  });

  it('should create S3 bucket', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
  });

  it('should create Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Timeout: 30
    });
  });

  it('should create SES receipt rule set', () => {
    template.hasResourceProperties('AWS::SES::ReceiptRuleSet', {
      RuleSetName: 'email-forwarding-rules'
    });
  });

  it('should grant Lambda read access to S3', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['s3:GetObject*', 's3:GetBucket*', 's3:List*'])
          })
        ])
      }
    });
  });

  it('should pass smtpUser and smtpPassword to Lambda environment', () => {
    const app = new cdk.App();
    const stack = new AwsSmtpRelayStack(app, 'AuthTestStack', {
      domainName: 'test.com',
      smtpHost: 'smtp.test.com',
      smtpPort: '25',
      smtpUser: 'myuser',
      smtpPassword: 'mypassword'
    });
    const authTemplate = Template.fromStack(stack);
    authTemplate.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          SMTP_USER: 'myuser',
          SMTP_PASSWORD: 'mypassword'
        })
      }
    });
  });
});
