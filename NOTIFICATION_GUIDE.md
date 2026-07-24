# NEXUS Notification System — Complete User & Administrator Guide

Welcome to the **NEXUS Notification System Guide**. This document explains exactly how notifications work on the frontend, how users are notified when new updates arrive, and how you (or the AI Agent) can manually or automatically publish new announcements.

---

## 1. How the Notification System Works (Architecture)

NEXUS uses a lightweight, zero-database **RSS/XML Feed** approach combined with browser LocalStorage. This mirrors the proven architecture used by high-traffic streaming platforms while ensuring zero server overhead.

### Where Notifications Are Stored
All public announcements live in a single XML file:
```
public/notifications.xml
```
When your site is built and deployed, this file is served publicly at the URL root (`https://your-domain.com/notifications.xml`).

### How the Frontend Reads Notifications
When a user visits NEXUS:
1. The **`useNotifications()`** React hook (`src/components/overlays/notificationsModal/hooks/useNotifications.ts`) runs automatically on page load.
2. It fetches `/notifications.xml` and uses `DOMParser` to parse the `<channel>` items (`<guid>`, `<title>`, `<description>`, `<link>`, `<pubDate>`, and `<category>`).
3. The items are sorted chronologically (`pubDate`) and made available to the navigation header and the **Notification Modal** drawer.

---

## 2. How Users Get Notified & Unread Badges

### The Unread Dot/Badge
How does the red badge count (`getUnreadCount()`) appear on the top-right bell icon?
1. Every notification item in `public/notifications.xml` has a unique ID tag called `<guid>`. Example:
   ```xml
   <guid>nexus-notif-2026-07-18-88pct</guid>
   ```
2. When a user opens NEXUS, the browser checks `localStorage.getItem("read-notifications")` (which stores an array of `<guid>` strings the user has already seen).
3. If the browser finds any `<guid>` from `notifications.xml` that is **NOT** in the user's `read-notifications` array, it counts it as **unread** and displays the red notification badge on the bell icon!

### Reading & Dismissing
- When the user clicks the bell icon, the `NotificationModal` overlay opens, displaying all announcements.
- As they read items or click **"Mark all as read"**, those `<guid>` values are saved to their `localStorage` so the red badge disappears until you publish a new notification.

---

## 3. Step-by-Step Guide: How to Manually Add a Notification

You can manually publish new announcements, system maintenance alerts, or feature updates anytime without writing a single line of JavaScript!

### Step 1: Open `public/notifications.xml`
Open `public/notifications.xml` in your IDE or text editor. You will see the `<channel>` block.

### Step 2: Add a New `<item>` Block at the Top
Right below `<lastBuildDate>` (and above the previous `<item>`), paste a new item block following this exact template:

```xml
    <item>
      <!-- 1. Unique ID: Change this every time so users get notified! -->
      <guid>nexus-notif-YYYY-MM-DD-shortname</guid>
      
      <!-- 2. Title of your announcement -->
      <title>Your Announcement Title Here</title>
      
      <!-- 3. Detailed message (supports line breaks and bullet points) -->
      <description>We have added new servers and upgraded our video player!
      
• Faster streaming speeds across all regions
• New 4K resolution options available

Check our Discord server for more details!
      </description>
      
      <!-- 4. Link when users click the notification (e.g. Discord or feature page) -->
      <link>https://discord.gg/Jrj3w6t9mY</link>
      
      <!-- 5. Publication date (format: Day, DD Mon YYYY HH:MM:SS +Timezone) -->
      <pubDate>Sun, 19 Jul 2026 12:00:00 +0800</pubDate>
      
      <!-- 6. Category: "announcement", "update", or "maintenance" -->
      <category>announcement</category>
    </item>
```

### Step 3: Save and Push to GitHub!
Once you save `public/notifications.xml` and push/deploy your site to your server or VPS:
1. Every user who opens your site will fetch the new `notifications.xml`.
2. Because your new `<guid>` is not in their local storage yet, the red badge will instantly light up to notify them!

---

## 4. Automated AI Agent Auto-Changelog Rules

As established in the mandatory project protocols (`README.md` and `AGENTS.md`), you do not always have to add notifications manually. Whenever you ask the AI Agent (Antigravity) to push changes to GitHub or complete a major feature milestone, the AI Agent will automatically:
1. Update `README.md` with a timestamped changelog (`Month Date, Year Time`).
2. Add a new `<item>` entry to `public/notifications.xml` summarizing the new features so users get notified automatically upon deployment!
