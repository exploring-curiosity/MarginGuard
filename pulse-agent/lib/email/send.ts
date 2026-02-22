import { Resend } from "resend";

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  priority?: "normal" | "high" | "urgent";
}

export async function sendEmail({
  to,
  subject,
  body,
  priority = "normal",
}: SendEmailParams): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("RESEND_API_KEY not set — email sending skipped (dry run)");
    return {
      success: true,
      message_id: `dry-run-${Date.now()}`,
    };
  }

  const resend = new Resend(apiKey);

  const priorityLabel =
    priority === "urgent" ? "🚨 URGENT: " : priority === "high" ? "⚠️ " : "";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #1a1a2e; }
    .header { background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .header h1 { color: white; margin: 0; font-size: 22px; }
    .header p { color: #aaa; margin: 5px 0 0; font-size: 13px; }
    .body { background: #f9f9f9; padding: 20px; border: 1px solid #eee; }
    .footer { background: #eee; padding: 10px 20px; font-size: 11px; color: #888; border-radius: 0 0 8px 8px; }
    pre { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 4px; white-space: pre-wrap; font-size: 13px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; }
    .badge.urgent { background: #ff4444; color: white; }
    .badge.high { background: #ff8800; color: white; }
    .badge.normal { background: #4CAF50; color: white; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Pulse — HVAC Margin Intelligence</h1>
    <p>Agent Alert ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
  </div>
  <div class="body">
    <span class="badge ${priority}">${priority.toUpperCase()}</span>
    <br/><br/>
    <pre>${body}</pre>
  </div>
  <div class="footer">
    Sent by Pulse AI Agent · ${new Date().toISOString()} · Reply to this email to respond to the agent
  </div>
</body>
</html>
  `.trim();

  try {
    const fromAddress = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

    const { data, error } = await resend.emails.send({
      from: `Pulse AI <${fromAddress}>`,
      to: [to],
      subject: `${priorityLabel}${subject}`,
      html: htmlBody,
      text: body,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, message_id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Email send failed:", message);
    return { success: false, error: message };
  }
}
