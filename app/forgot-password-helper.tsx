"use client";

import { useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDoJZkKsXrwG7d7QsYBQhdO7IfGcOG8gws",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "alsa-store-billing.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "alsa-store-billing",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "alsa-store-billing.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "918214002690",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:918214002690:web:588127c30be3946574bf1b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-ZGP48F4W4X",
};

function getClientAuth() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getAuth(app);
}

export function ForgotPasswordHelper() {
  useEffect(() => {
    const injectResetButton = () => {
      if (document.getElementById("alsa-forgot-password-button")) return;
      const emailInput = document.querySelector<HTMLInputElement>('input[type="email"], input[name="email"]');
      const passwordInput = document.querySelector<HTMLInputElement>('input[type="password"]');
      if (!emailInput || !passwordInput) return;
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
        if (!email) {
          status.textContent = "Email ID type pannunga.";
          status.style.color = "#b42318";
          return;
        }
        button.textContent = "Sending reset email...";
        button.setAttribute("disabled", "true");
        try {
          await sendPasswordResetEmail(getClientAuth(), email);
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
