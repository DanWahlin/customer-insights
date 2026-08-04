import { CommunicationIdentityClient } from '@azure/communication-identity';
import { EmailClient, EmailMessage, KnownEmailSendStatus } from '@azure/communication-email';
import { SmsClient, SmsSendResult } from '@azure/communication-sms';
import './config';

const connectionString = process.env.ACS_CONNECTION_STRING as string;

async function createACSToken() {
  if (!connectionString) throw new Error('ACS_CONNECTION_STRING is not configured.');

  const tokenClient = new CommunicationIdentityClient(connectionString);
  const { user, token } = await tokenClient.createUserAndToken(['voip']);
  return {
    userId: user.communicationUserId,
    token
  };
}

async function sendEmail(
  subject: string,
  message: string,
  customerName: string,
  customerEmailAddress: string
): Promise<{ status: boolean; id: string }> {
  if (!connectionString) throw new Error('ACS_CONNECTION_STRING is not configured.');
  const senderAddress = process.env.ACS_EMAIL_ADDRESS;
  if (!senderAddress) throw new Error('ACS_EMAIL_ADDRESS is not configured.');

  const emailClient = new EmailClient(connectionString);
  const email: EmailMessage = {
    senderAddress,
    content: {
      subject,
      plainText: message
    },
    recipients: {
      to: [{ address: customerEmailAddress, displayName: customerName }]
    }
  };

  const poller = await emailClient.beginSend(email);
  const result = await poller.pollUntilDone();
  if (result.status !== KnownEmailSendStatus.Succeeded) {
    throw new Error(result.error?.message ?? `Email send failed with status ${result.status}.`);
  }
  return { status: true, id: result.id };
}

async function sendSms(message: string, customerPhoneNumber: string): Promise<SmsSendResult[]> {
  if (!connectionString) throw new Error('ACS_CONNECTION_STRING is not configured.');
  const sender = process.env.ACS_PHONE_NUMBER;
  if (!sender) throw new Error('ACS_PHONE_NUMBER is not configured.');

  const smsClient = new SmsClient(connectionString);
  const results = await smsClient.send({
    from: sender,
    to: [customerPhoneNumber],
    message
  });
  const failed = results.filter(result => !result.successful);
  if (failed.length) {
    throw new Error(failed.map(result => result.errorMessage ?? 'SMS send failed.').join(' '));
  }
  return results;
}

export { createACSToken, sendEmail, sendSms };
