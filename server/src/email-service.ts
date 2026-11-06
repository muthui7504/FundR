function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendEmailVerificationCode(email: string, name: string, code: string) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.SMTP_FROM?.trim();

  if (!apiKey || !from)
    throw new Error("Email delivery is not configured. Set BREVO_API_KEY and SMTP_FROM.");

  const safeName = escapeHtml(name);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: from, name: "Fundraise" },
      to: [{ email, name }],
      subject: "Your Fundraise verification code",
      textContent: `Hello ${name},\n\nYour Fundraise verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      htmlContent: `<p>Hello ${safeName},</p><p>Your Fundraise verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    if (response.status === 401)
      console.error(`Brevo API key was rejected (runtime key length: ${apiKey.length}).`);
    throw new Error(`Brevo email API request failed with status ${response.status}.`);
  }
}
