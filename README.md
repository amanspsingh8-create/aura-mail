# AuraMail ✉️
> A premium, serverless temporary email client powered by the Mail.tm API.

AuraMail is a production-ready, beautiful, and privacy-focused disposable temporary email client. Designed with rich glassmorphism aesthetics, fluid micro-animations, and client-side persistence, it offers a seamless and highly premium user experience.

---

## 🌟 Key Features

- **Instant Address Generation**: Automates username and domain assignment via Mail.tm API instantly on loading.
- **Address Persistence**: Saves your generated inbox token and details inside `localStorage`. Reloading, closing, or navigating away won't lose your emails.
- **Fluid UI & Dark Mode**: A stunning, modern dark neon design built using HSL custom CSS variables, custom scrollbars, glowing cards, and micro-interactions.
- **Secure Sandbox Render**: Received email body elements (HTML & Text) are rendered inside an isolated `iframe` with `sandbox` privileges, protecting your client browser from malicious scripts, trackers, or cookies.
- **Auto & Manual Polling**: Features an auto-fetch mechanism ticking every 10 seconds, paired with a gorgeous animated SVG countdown ring. Manual refresh overrides the countdown.
- **Audio Chime & Native Notifications**: Triggers gentle synthesized audio chimes using the browser's Web Audio API and schedules desktop notification banners when a new mail is received.
- **Attachments Downloading**: Allows viewing and downloading email attachments securely with authorization.
- **Local Wipe Controls**: Complete control to wipe stored mailbox sessions and immediately cycle to a new address.

---

## 🚀 How to Run AuraMail

Since AuraMail is built using client-safe, modern ES Modules without compiling or heavy node dependency overhead, it can be launched directly!

### Option A: Open directly in a Web Browser (Zero Installation)
1. Navigate to the project directory: `C:\Users\Aman\.gemini\antigravity\scratch\temp-mail-app`.
2. Right-click on [index.html](file:///C:/Users/Aman/.gemini/antigravity/scratch/temp-mail-app/index.html) and select **Open With** -> **Google Chrome**, **Firefox**, **Microsoft Edge**, or **Safari**.
3. The app will immediately load, connect to the Mail.tm API, and generate an address!

### Option B: Local Live Server (Recommended for Developers)
If you are using VS Code:
1. Open the folder `temp-mail-app` in VS Code.
2. If you have the **Live Server** extension installed, click the **Go Live** button in the bottom right corner of the window.
3. This serves the files from `http://127.0.0.1:5500` which allows full functional support for web browser audio permission and notifications.

---

## 🛠️ Tech Stack & Architecture

- **Markup**: Semantic HTML5.
- **Styles**: Modern CSS3. Uses glassmorphic backdrop filters, custom CSS variables, SVG scaling, and custom keyframe transitions.
- **Interactions**: Vanilla JS (ES6+). Structured cleanly using a centralized application state.
- **Data Layer**: Integrated with [Mail.tm](https://mail.tm) REST API.
- **Icons**: FontAwesome 6 (CDN).
- **Fonts**: Outfit (headers) and Inter (body content) from Google Fonts.
