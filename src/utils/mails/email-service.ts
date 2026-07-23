// utils/mails/email-service.ts
import nodemailer from 'nodemailer'
import { configDotenv } from 'dotenv'

configDotenv()

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
})

interface SendInviteEmailParams {
    to: string
    tenantName: string
    tenantSubdomain: string
    tempPassword: string
    invitedBy: string
    role: string
}
interface SendMemberInviteEmailParams {
    to: string
    memberName: string
    tenantName: string
    tenantSubdomain: string
    tempPassword: string
    invitedBy: string
    role?: string
    loginUrl?: string
}

export const sendTenantInviteEmail = async (params: SendInviteEmailParams) => {
    const { to, tenantName, tenantSubdomain, tempPassword, invitedBy, role } = params
    
    // ✅ FIX 1: Proper URL construction with fallbacks
    const protocol = process.env.FRONTEND_PROTOCOL || 'https';
    const domain = process.env.FRONTEND_DOMAIN || 'localhost:5173';
    
    // ✅ FIX 2: Handle subdomain properly
    let loginUrl: string;
    if (tenantSubdomain && tenantSubdomain !== 'default') {
        loginUrl = `${protocol}://${tenantSubdomain}.${domain}`;
    } else {
        loginUrl = `${protocol}://${domain}`;
    }
    
    // ✅ FIX 3: Add login path
    loginUrl = `${loginUrl}/login`;
    
    const subject = `You've been invited to join ${tenantName} as ${role}`;

    // ✅ FIX 4: Corrected HTML with inline styles for email clients
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invitation to ${tenantName}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
                /* ✅ FIX 5: Fixed double semicolon */
                .button { 
                    display: inline-block; 
                    background: #4F46E5; 
                    color: #f9fafb; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 6px; 
                    margin-top: 20px; 
                }
                .button:hover { background: #4338CA; }
                .footer { margin-top: 20px; font-size: 12px; color: #6b7280; text-align: center; }
                .label { font-weight: 600; color: #374151; }
                .value { 
                    color: #1f2937; 
                    font-family: monospace; 
                    background: #f3f4f6; 
                    padding: 2px 6px; 
                    border-radius: 4px; 
                }
                /* ✅ FIX 6: Mobile responsive */
                @media only screen and (max-width: 480px) {
                    .container { padding: 10px; }
                    .content { padding: 20px; }
                    .button { display: block; text-align: center; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to ${tenantName}</h1>
                </div>
                <div class="content">
                    <p>Hello,</p>
                    <p><strong>${invitedBy}</strong> has invited you to join <strong>${tenantName}</strong> as a <strong>${role}</strong>.</p>
                    
                    <div class="credentials">
                        <h3>Your Login Credentials</h3>
                        <p><span class="label">Email:</span> <span class="value">${to}</span></p>
                        <p><span class="label">Temporary Password:</span> <span class="value">${tempPassword}</span></p>
                        <p><span class="label">Tenant:</span> <span class="value">${tenantName}</span></p>
                        <p><span class="label">Subdomain:</span> <span class="value">${tenantSubdomain}.${domain}</span></p>
                    </div>

                    <p><strong>Please log in and change your password immediately.</strong></p>

                    <!-- ✅ FIX 7: Both button and text link -->
                    <div style="text-align: center;">
                        <a href="${loginUrl}" class="button" style="color: #f9fafb; text-decoration: none;">
                            Click here to login
                        </a>
                    </div>

                    <!-- ✅ FIX 8: Fallback plain text link -->
                    <p style="text-align: center; font-size: 14px; color: #6b7280; margin-top: 10px;">
                        Or copy and paste this link: 
                        <a href="${loginUrl}" style="color: #4F46E5; word-break: break-all;">
                            ${loginUrl}
                        </a>
                    </p>

                    <p style="color: #ef4444; font-size: 14px; background: #fef2f2; padding: 10px; border-radius: 6px; border-left: 4px solid #ef4444;">
                        ⚠️ This password is temporary. Please change it after your first login.
                    </p>

                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />

                    <p style="font-size: 14px;">
                        If you have any questions, please contact your tenant administrator.
                    </p>
                </div>
                <div class="footer">
                    <p>This is an automated message from ${process.env.APP_NAME || 'Benevolent Fund'}.</p>
                    <p>&copy; ${new Date().getFullYear()} ${process.env.APP_NAME || 'Benevolent Fund'}. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    // ✅ FIX 9: Plain text version for email clients
    const text = `
        Welcome to ${tenantName}!
        
        ${invitedBy} has invited you to join ${tenantName} as ${role}.
        
        Your Login Credentials:
        Email: ${to}
        Temporary Password: ${tempPassword}
        Tenant: ${tenantName}
        Subdomain: ${tenantSubdomain}.${domain}
        
        Login URL: ${loginUrl}
        
        Please log in and change your password immediately.
        
        This is an automated message from ${process.env.APP_NAME || 'Benevolent Fund'}.
    `;

    try {
        const info = await transporter.sendMail({
            from: `"${process.env.APP_NAME || 'Benevolent Fund'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            html,
            text // ✅ FIX 10: Plain text fallback
        });

        console.log(`✅ Email sent to ${to}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
        
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        return { success: false, error: error };
    }
};



// ✅ NEW: Send member invitation email
export const sendMemberInviteEmail = async (params: SendMemberInviteEmailParams) => {
    const { 
        to, 
        memberName, 
        tenantName, 
        tenantSubdomain, 
        tempPassword, 
        invitedBy, 
        role = 'Member',
        loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`
    } = params

    const subject = `You've been invited to join ${tenantName} as a ${role}`

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; }
                .button { display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
                .button:hover { background: #059669; }
                .footer { margin-top: 20px; font-size: 12px; color: #6b7280; text-align: center; }
                .label { font-weight: 600; color: #374151; }
                .value { color: #1f2937; font-family: monospace; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
                .warning { color: #ef4444; font-size: 14px; }
                .tenant-info { background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Welcome to ${tenantName}!</h1>
                </div>
                <div class="content">
                    <p>Hello <strong>${memberName}</strong>,</p>
                    
                    <p><strong>${invitedBy}</strong> has invited you to join <strong>${tenantName}</strong> as a <strong>${role}</strong>.</p>
                    
                    <div class="tenant-info">
                        <p style="margin: 0;"><strong>Organization:</strong> ${tenantName}</p>
                        <p style="margin: 5px 0 0 0;"><strong>Subdomain:</strong> ${tenantSubdomain}</p>
                    </div>

                    <div class="credentials">
                        <h3 style="margin-top: 0;">🔑 Your Login Credentials</h3>
                        <p><span class="label">Email:</span> <span class="value">${to}</span></p>
                        <p><span class="label">Temporary Password:</span> <span class="value">${tempPassword}</span></p>
                        <p><span class="label">Role:</span> <span class="value">${role}</span></p>
                    </div>

                    <div style="text-align: center;">
                        <a href="${loginUrl}" class="button">
                            🚀 Login to Your Account
                        </a>
                    </div>

                    <div style="margin-top: 20px; font-size: 14px; background: #f3f4f6; padding: 15px; border-radius: 6px;">
                        <p style="margin: 0;"><strong>Direct Login URLs:</strong></p>
                        <p style="margin: 5px 0 0 0; word-break: break-all;">
                            Main: ${loginUrl}
                        </p>
                        <p style="margin: 5px 0 0 0; word-break: break-all;">
                            Tenant: http://${tenantSubdomain}.${process.env.BASE_DOMAIN || 'localhost:5173'}/login
                        </p>
                    </div>

                    <p class="warning">
                        ⚠️ <strong>Important:</strong> This password is temporary. Please change it after your first login.
                    </p>

                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />

                    <p style="font-size: 14px; color: #6b7280;">
                        If you have any questions or need assistance, please contact your organization administrator.
                    </p>
                    
                    <p style="font-size: 14px; color: #6b7280;">
                        This is an automated message from ${process.env.APP_NAME || 'Your App'}. Please do not reply to this email.
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} ${process.env.APP_NAME || 'Your App'}. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `

    try {
        const info = await transporter.sendMail({
            from: `"${process.env.APP_NAME || 'Your App'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            html
        })

        console.log(`✅ Member invitation email sent to ${to}: ${info.messageId}`)
        return { success: true, messageId: info.messageId }
    } catch (error) {
        console.error('❌ Member email sending failed:', error)
        return { success: false, error: error }
    }
}

// Alternative: Send email using a simpler function
export const sendEmail = async (to: string, subject: string, html: string) => {
    try {
        const info = await transporter.sendMail({
            from: `"${process.env.APP_NAME || 'Benevolent Fund'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            html
        });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Email sending failed:', error);
        return { success: false, error: error };
    }
};