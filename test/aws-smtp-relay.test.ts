import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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
      Runtime: 'nodejs20.x',
      Timeout: 30
    });
  });

  it('should create SES receipt rule set', () => {
    template.hasResourceProperties('AWS::SES::ReceiptRuleSet', {
      RuleSetName: 'email-forwarding-test-com'
    });
  });

  it('should grant Lambda read access to S3', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: expect.arrayContaining([
          expect.objectContaining({
            Action: expect.arrayContaining(['s3:GetObject*', 's3:GetBucket*', 's3:List*'])
          })
        ])
      }
    });
  });
});
