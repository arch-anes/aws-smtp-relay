import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SQSEvent } from 'aws-lambda';
import * as nodemailer from 'nodemailer';

const s3 = new S3Client({});

export const handler = async (event: SQSEvent) => {
  const domainName = process.env.DOMAIN_NAME!;
  const bucket = process.env.BUCKET_NAME!;
  const host = process.env.SMTP_HOST!;
  const port = parseInt(process.env.SMTP_PORT!);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  
  const body = JSON.parse(event.Records[0].body);
  const sesMessage = JSON.parse(body.Message);
  const messageId = sesMessage.mail.messageId;
  const key = `emails/${messageId}`;
  
  const s3Response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const emailRaw = await s3Response.Body!.transformToString();
  
  const transporter = nodemailer.createTransport({
    host: host,
    port: port,
    name: `aws-relay.${domainName}`,
    secure: port === 465 || port === 2465,
    requireTLS: port !== 25 && port !== 465 && port !== 2465,
    auth: user && password ? {
      user: user,
      pass: password
    } : undefined,
    tls: { rejectUnauthorized: false }
  });
  
  try {
    await transporter.sendMail({
      envelope: {
        from: sesMessage.mail.source,
        to: sesMessage.mail.destination
      },
      raw: emailRaw
    });
    return { statusCode: 200, body: 'Email forwarded' };
  } catch (error) {
    console.error('Failed to relay email:', error);
    throw error;
  }
};
