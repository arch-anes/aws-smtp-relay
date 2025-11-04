# AWS SES SMTP Relay - Architecture Documentation

## Overview

Bidirectional email relay between AWS SES and self-hosted email servers for highly available email infrastructure.

## Architecture Diagrams

### Inbound Flow (Internet → SES → Self-Hosted)

```mermaid
graph LR
    A[Internet] --> B[SES Receipt Rule]
    B --> C[S3 Bucket]
    C --> D[SNS Topic]
    D --> E[SQS Queue]
    E --> F[Lambda]
    F --> G[Self-Hosted SMTP Endpoint]
    E --> H[Dead Letter Queue]
```

### Outbound Flow (Self-Hosted → SES → Internet)

```mermaid
graph LR
    A[Self-Hosted MTA<br/>Postfix/Stalwart] --> B[SES SMTP Endpoint]
    B --> C[Internet]
```

### Bidirectional Setup

```mermaid
graph TB
    Internet[Internet]
    SES[AWS SES<br/>Inbound + Outbound]
    Server[Self-Hosted Server]
    
    Internet <-->|Inbound| SES
    SES <-->|Relay| Server
    Server <-->|Outbound| SES
    SES <-->|Send| Internet
```

## Components

### Inbound Components

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| **SES Receipt Rule** | Receives emails for verified domains | Triggers on recipient match |
| **S3 Bucket** | Temporary email storage | 30-day lifecycle, encrypted |
| **SNS Topic** | Event notification | Decouples SES from processing |
| **SQS Queue** | Message buffering | Configurable retry delay |
| **Lambda Function** | Email forwarding | Retrieves from S3, sends via SMTP |
| **Dead Letter Queue** | Failed message storage | 14-day retention |

### Outbound Components

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| **IAM User** | SMTP authentication | `ses:SendRawEmail` permission |
| **SES SMTP Endpoint** | Email submission | `email-smtp.region.amazonaws.com:587` |
| **Self-Hosted MTA** | Relay configuration | Postfix/Exim/Sendmail |

## Setup Guide

### Inbound Setup (Internet → SES → Self-Hosted)

#### 1. Verify Domain
```bash
aws ses verify-domain-identity --domain yourdomain.com
```

#### 2. Configure DNS
```
# MX Record
yourdomain.com.  MX  10  inbound-smtp.us-east-1.amazonaws.com

# Verification TXT
_amazonses.yourdomain.com.  TXT  "verification-token"

# SPF Record
yourdomain.com.  TXT  "v=spf1 include:amazonses.com ~all"
```

#### 3. Deploy Stack
```bash
npx cdk deploy \
  -c domainName=yourdomain.com \
  -c smtpHost=mail.yourserver.com \
  -c smtpPort=25 \
  -c recipients="@yourdomain.com"
```

#### 4. Activate Rule Set
```bash
aws ses set-active-receipt-rule-set --rule-set-name email-forwarding-rules
```

### Outbound Setup (Self-Hosted → SES → Internet)

#### 1. Create IAM User
   ```bash
   aws iam create-user --user-name ses-smtp-user
   aws iam create-access-key --user-name ses-smtp-user
   ```

Attach inline policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "ses:SendRawEmail",
    "Resource": "*"
  }]
}
```

**Note**: SMTP Username = Access Key ID, SMTP Password = SIG4-converted Secret Key
(Use AWS Console: SES → SMTP Settings → Create SMTP Credentials)

#### 2. Verify Domain
   ```bash
   aws ses verify-domain-identity --domain yourdomain.com
   ```
Add verification TXT record to DNS

#### 3. Configure MTA Relay

**Postfix** (`/etc/postfix/main.cf`):
```
relayhost = [email-smtp.us-east-1.amazonaws.com]:587
smtp_sasl_auth_enable = yes
smtp_sasl_security_options = noanonymous
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_use_tls = yes
smtp_tls_security_level = encrypt
```

`/etc/postfix/sasl_passwd`:
```
[email-smtp.us-east-1.amazonaws.com]:587 AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

Apply:
```bash
postmap /etc/postfix/sasl_passwd
chmod 600 /etc/postfix/sasl_passwd*
systemctl reload postfix
```

**Exim** (`/etc/exim4/passwd.client`):
```
email-smtp.us-east-1.amazonaws.com:AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**Sendmail** (`/etc/mail/authinfo`):
```
AuthInfo:email-smtp.us-east-1.amazonaws.com "U:AKIAIOSFODNN7EXAMPLE" "P:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" "M:PLAIN"
```

#### 4. Configure SPF and DKIM

SPF:
```
yourdomain.com.  TXT  "v=spf1 include:amazonses.com ~all"
```

DKIM:
```bash
aws ses verify-domain-dkim --domain yourdomain.com
```
Add 3 CNAME records from output

#### 5. Request Production Access

AWS Console: SES → Account Dashboard → Request production access
(Required to send to non-verified addresses)

### Bidirectional Setup

1. Complete inbound setup (above)
2. Complete outbound setup (above)
3. Configure monitoring (below)

## High Availability

### Inbound HA Features
- SES 99.9% SLA with multi-AZ deployment
- SQS automatic retries (default: 3 attempts)
- Lambda auto-scaling
- DLQ for failed messages

### Outbound HA Features
- SES SMTP multi-AZ endpoints
- MTA connection pooling
- Automatic failover

### Multi-Region Setup

**Primary Region**:
```bash
export AWS_REGION=us-east-1
npx cdk deploy -c domainName=yourdomain.com -c smtpHost=mail.yourserver.com -c smtpPort=25
```

**Secondary Region**:
```bash
export AWS_REGION=us-west-2
npx cdk deploy -c domainName=yourdomain.com -c smtpHost=mail-backup.yourserver.com -c smtpPort=25
```

**DNS Failover**:
```
yourdomain.com.  MX  10  inbound-smtp.us-east-1.amazonaws.com
yourdomain.com.  MX  20  inbound-smtp.us-west-2.amazonaws.com
```

## Monitoring

### Key Metrics

| Service | Metric | Threshold |
|---------|--------|----------|
| Lambda | Errors | > 5 in 5 min |
| Lambda | Duration | > 25 sec |
| SQS | ApproximateAgeOfOldestMessage | > 300 sec |
| SQS DLQ | ApproximateNumberOfMessagesVisible | > 0 |
| S3 | NumberOfObjects | Monitor growth |

### CloudWatch Alarms

**DLQ Alert**:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name email-relay-dlq-messages \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold
```

**Lambda Errors**:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name email-relay-lambda-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

## Security

### Encryption
- S3 bucket encryption (default)
- TLS for SMTP connections
- SQS encryption at rest (optional)

### IAM Permissions
- Lambda: S3 read-only
- SES: S3 write to specific prefix
- Outbound IAM user: `ses:SendRawEmail` only

### Network Security
- Lambda in VPC (optional for private SMTP)
- Security groups for SMTP access
- VPC endpoints for AWS services

### Email Authentication
- SPF: Authorize SES
- DKIM: Sign outbound emails
- DMARC: Domain protection policy

## Troubleshooting

### Inbound Issues

| Problem | Check |
|---------|-------|
| Emails not received | MX records: `dig MX yourdomain.com` |
| | SES verification: `aws ses get-identity-verification-attributes` |
| | Active rule set: `aws ses describe-active-receipt-rule-set` |
| Emails not forwarded | DLQ messages |
| | Lambda logs in CloudWatch |
| | SMTP server reachability |
| High latency | Increase Lambda memory |
| | Check VPC endpoint for S3 |

### Outbound Issues

| Problem | Check |
|---------|-------|
| Authentication failed | Verify SMTP credentials |
| | IAM user permissions |
| Connection timeout | Security groups (port 587) |
| | DNS resolution of SES endpoint |
| Emails rejected | Domain verification status |
| | SES sandbox mode |
| | Bounce/complaint rates |

## Cost Estimate

| Service | Cost | Notes |
|---------|------|-------|
| SES Inbound | $0.10/1K emails | Receiving |
| SES Outbound | $0.10/1K emails | Sending |
| Lambda | Free tier: 1M requests | Then $0.20/1M |
| SQS | Free tier: 1M requests | Then $0.40/1M |
| S3 | $0.023/GB/month | 30-day lifecycle |
| Data Transfer | $0.09/GB | Outbound |

## Scaling

| Component | Limit | Notes |
|-----------|-------|-------|
| Lambda | 1,000 concurrent | Increase via quota request |
| SQS | Unlimited | No throughput limit |
| SES Receiving | No hard limit | Contact AWS for >100K/day |
| SES Sending | Sandbox: 200/day | Production: 50K+/day |
| S3 | Unlimited | No storage limit |

**High Volume (>100K emails/day)**:
- Enable Lambda reserved concurrency
- Implement batch processing
- Consider Step Functions for complex workflows
