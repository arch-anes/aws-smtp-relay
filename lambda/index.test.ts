import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as nodemailer from 'nodemailer';

const mockS3Send = jest.fn();
const mockSendMail = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: (...args: any[]) => mockS3Send(...args)
    })),
    GetObjectCommand: jest.fn()
  };
});
jest.mock('nodemailer');

import { handler } from './index';
import { SQSEvent } from 'aws-lambda';

describe('Email Forwarder Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: mockSendMail });
    
    process.env.BUCKET_NAME = 'test-bucket';
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '25';
  });

  it('should forward email via SMTP', async () => {
    const event: SQSEvent = {
      Records: [{
        body: JSON.stringify({
          Message: JSON.stringify({
            mail: {
              messageId: 'test-message-id',
              source: 'sender@example.com',
              destination: ['recipient@example.com']
            }
          })
        })
      }]
    } as any;

    mockS3Send.mockResolvedValue({
      Body: { transformToString: async () => 'raw email content' }
    });
    mockSendMail.mockResolvedValue({});

    const result = await handler(event);

    expect(mockS3Send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
    expect(mockSendMail).toHaveBeenCalledWith({
      envelope: { from: 'sender@example.com', to: ['recipient@example.com'] },
      raw: 'raw email content'
    });
    expect(result).toEqual({ statusCode: 200, body: 'Email forwarded' });
  });

  it('should use implicit TLS for port 465', async () => {
    process.env.SMTP_PORT = '465';
    
    const event: SQSEvent = {
      Records: [{
        body: JSON.stringify({
          Message: JSON.stringify({
            mail: {
              messageId: 'test-id',
              source: 'from@test.com',
              destination: ['to@test.com']
            }
          })
        })
      }]
    } as any;

    mockS3Send.mockResolvedValue({
      Body: { transformToString: async () => 'email' }
    });
    mockSendMail.mockResolvedValue({});

    await handler(event);

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ secure: true, port: 465 })
    );
  });
});
