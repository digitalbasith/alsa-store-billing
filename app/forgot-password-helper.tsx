"use client";

import { useEffect } from "react";

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDoJZkKsXrwG7d7QsYBQhdO7IfGcOG8gws";

async function sendResetEmail(email: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = result?.error?.message || "RESET_FAILED";
    if (code === "EMAIL_NOT_FOUND") throw new Error("இந்த email account-la illa. Correct email ID type pannunga.");
    if (code === "INVALID_EMAIL") throw new Error("Email ID correct-a type pannunga.");
    throw new Error(`Password reset failed: ${code}`);
  }
  return result;
}

export function ForgotPasswordHelper() {
  useEffect(() => {
    const injectResetButton = () => {
      const existing = document.getElementById("alsa-forgot-password-button");
      const emailInput = document.querySelector<HTMLInputElement>('input[type="email"], input[name="email"]');
      const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]');
      if (existing || !emailInput || !passwordInput) return;
      const container = passwordInput.closest("label") || passwordInput.parentElement;
      if (!container?.parentElement) return;

      const button = document.createElement("button");
      button.id = "alsa-forgot-password-button";
      button.type = "button";
      button.textContent = "Forgot password? Send reset email";
      button.setAttribute("aria-label", "Send password reset email");
      button.style.width = "100%";
      button.style.margin = "10px 0 4px";
      button.style.border = "0";
      button.style.background = "transparent";
      button.style.color = "#284bb8";
      button.style.fontSize = "13px";
      button.style.fontWeight = "800";
      button.style.textAlign = "center";
      button.style.cursor = "pointer";

      const status = document.createElement("p");
      status.id = "alsa-forgot-password-status";
      status.style.margin = "4px 0 0";
      status.style.textAlign = "center";
      status.style.fontSize = "12px";
      status.style.fontWeight = "700";
      status.style.color = "#177245";

      button.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const oldPermissionError = Array.from(document.querySelectorAll("p,div,span"))
          .find((node) => node.textContent?.trim() === "Missing or insufficient permissions.");
        if (oldPermissionError) oldPermissionError.textContent = "";
        if (!email) {
          status.textContent = "Email ID type pannunga.";
          status.style.color = "#b42318";
          return;
        }
        button.textContent = "Sending reset email...";
        button.setAttribute("disabled", "true");
        try {
          await sendResetEmail(email);
          status.textContent = `Reset link sent to ${email}. Gmail inbox/spam check pannunga.`;
          status.style.color = "#177245";
          button.textContent = "Reset email sent";
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Reset email send ஆகல.";
          status.style.color = "#b42318";
          button.textContent = "Forgot password? Send reset email";
          button.removeAttribute("disabled");
        }
      });

      container.parentElement.insertBefore(button, container.nextSibling);
      container.parentElement.insertBefore(status, button.nextSibling);
    };

    injectResetButton();
    const timer = window.setInterval(injectResetButton, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
