# AWS SES to SMTP Relay

This CDK project receives emails via AWS SES and forwards them to another SMTP server.

## Architecture

- **S3 Bucket**: Stores incoming emails temporarily
- **Lambda Function**: Processes and forwards emails to SMTP server
- **SES Receipt Rule**: Triggers the workflow when emails arrive


## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Verify your domain in SES**:
   ```bash
   aws ses verify-domain-identity --domain yourdomain.com
   ```

4. **Configure MX records**:
   Add MX record pointing to SES inbound endpoint for your region:
   ```
   10 inbound-smtp.<region>.amazonaws.com
   ```

5. **Deploy** (for each domain):
   ```bash
   npm run build
   npx cdk deploy \
     -c domainName=yourdomain.com \
     -c smtpHost=smtp.yourserver.com \
     -c smtpPort=25
   ```

   **Configuration Parameters**:
   - `domainName` (required): Domain name for this relay
   - `smtpHost` (required): Target SMTP server hostname
   - `smtpPort` (required): SMTP port (25 for plain, 465/2465 for implicit TLS)
   - `recipients` (optional): Comma-separated list of recipients to filter (e.g., "@yourdomain.com,user@example.com")
   - `retryDelaySeconds` (optional): Seconds before retry on failure (default: 90)
   - `maxRetries` (optional): Maximum retry attempts before moving to DLQ (default: 3)

   Example with all parameters:
   ```bash
   npx cdk deploy \
     -c domainName=yourdomain.com \
     -c smtpHost=smtp.yourserver.com \
     -c smtpPort=25 \
     -c recipients="@yourdomain.com" \
     -c retryDelaySeconds=120 \
     -c maxRetries=5
   ```

6. **Activate the rule set**:
   ```bash
   aws ses set-active-receipt-rule-set --rule-set-name email-forwarding-yourdomain-com
   ```

## Multiple Domains

Deploy separate stacks for each domain:
```bash
npx cdk deploy -c domainName=domain1.com -c smtpHost=smtp1.example.com -c smtpPort=25
npx cdk deploy -c domainName=domain2.com -c smtpHost=smtp2.example.com -c smtpPort=465
```

## Retry & Error Handling

- Failed emails are automatically retried (default: 3 times with 90 second delay)
- After max retries, emails move to Dead Letter Queue (retained for 14 days)
- Check DLQ in AWS Console to investigate persistent failures



## Commands

* `npm run build`   - compile typescript to js
* `npm run watch`   - watch for changes and compile
* `npm run test`    - perform the jest unit tests
* `npx cdk deploy`  - deploy this stack to your default AWS account/region
* `npx cdk diff`    - compare deployed stack with current state
* `npx cdk synth`   - emits the synthesized CloudFormation template
