export interface QueryData {
    sql: string;
    paramValues: unknown[];
    error: string;
}

export interface EmailSmsResponse {
    status: boolean;
    emailSubject: string;
    emailBody: string;
    sms: string;
    error: string;
}
